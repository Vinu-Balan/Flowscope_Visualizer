import type { JavaProjectFile } from '@flowscope/parser-java';
import { parseJavaFile } from '@flowscope/parser-java';
import type { DiscoveredApi } from '@flowscope/parser-spring/api';
import { describe, expect, it } from 'vitest';
import { inferBusinessFlow } from './infer-business-flow';

/**
 * Hand-crafted snippets adapted from real patterns found while
 * investigating the user feedback behind docs/sprints/SPRINT-7.md —
 * `this.field.method(...)` calls, the Lombok builder pattern,
 * `Model.addAttribute(...)`, and classic-MVC view-name returns — none of
 * which `tests/fixtures/simple-customer-service` (a REST-only fixture)
 * exercises. Uses `parseJavaFile` directly rather than real files, for a
 * fast, self-contained end-to-end check of the whole pipeline.
 */
function projectFile(relativePath: string, source: string): JavaProjectFile {
  const result = parseJavaFile(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw result.error;
  return { relativePath, model: result.value };
}

const CONTROLLER_SOURCE = `
  package com.example;

  @Controller
  @RequestMapping("/admin")
  public class AdminController {
      private final ProductService productService;

      @PostMapping("products/add")
      public String addProduct(String name) {
          Product product = Product.builder().name(name).build();
          this.productService.addProduct(product);
          return "redirect:/admin/products";
      }

      @GetMapping("index")
      public String index(Model model) {
          model.addAttribute("username", "admin");
          model.addAttribute("role", "superadmin");
          return "index";
      }
  }
`;

const SERVICE_SOURCE = `
  package com.example;

  @Service
  public class ProductService {
      private final ProductRepository productRepository;

      public void addProduct(Product product) {
          this.productRepository.save(product);
      }
  }
`;

const FILES = [
  projectFile('AdminController.java', CONTROLLER_SOURCE),
  projectFile('ProductService.java', SERVICE_SOURCE),
];

function api(overrides: Partial<DiscoveredApi> & Pick<DiscoveredApi, 'methodName'>): DiscoveredApi {
  return {
    id: `id-${overrides.methodName}`,
    httpMethod: 'POST',
    path: '/admin/products/add',
    className: 'AdminController',
    file: 'AdminController.java',
    line: 1,
    ...overrides,
  };
}

const OVERLOAD_SOURCE = `
  package com.example;

  @Controller
  @RequestMapping("/admin")
  public class ProductAdminController {
      private final ProductService productService;
      private final CategoryService categoryService;

      @GetMapping("products/add")
      public ModelAndView addProduct() {
          ModelAndView mView = new ModelAndView("productsAdd");
          List<Category> categories = this.categoryService.getCategories();
          mView.addObject("categories", categories);
          return mView;
      }

      @PostMapping("products/add")
      public String addProduct(String name) {
          Product product = Product.builder().name(name).build();
          this.productService.addProduct(product);
          return "redirect:/admin/products";
      }
  }
`;

describe('inferBusinessFlow — overloaded handler methods (docs/sprints/SPRINT-7.md)', () => {
  const parsed = parseJavaFile(OVERLOAD_SOURCE);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw parsed.error;
  const controllerType = parsed.value.types.find((type) => type.name === 'ProductAdminController');
  const overloads = controllerType?.methods.filter((m) => m.name === 'addProduct') ?? [];
  const getAddProduct = overloads.find((m) => m.parameterCount === 0);
  const postAddProduct = overloads.find((m) => m.parameterCount === 1);
  const OVERLOAD_FILES = [projectFile('ProductAdminController.java', OVERLOAD_SOURCE)];

  it('parses both overloads distinctly, at different lines', () => {
    expect(overloads).toHaveLength(2);
    expect(getAddProduct).toBeDefined();
    expect(postAddProduct).toBeDefined();
    expect(getAddProduct?.line).not.toBe(postAddProduct?.line);
  });

  it('resolves the GET overload (no params) to its own body, not the POST one', () => {
    if (!getAddProduct) throw new Error('GET addProduct overload not found');
    const result = inferBusinessFlow(
      api({ methodName: 'addProduct', httpMethod: 'GET', line: getAddProduct.line, className: 'ProductAdminController', file: 'ProductAdminController.java' }),
      OVERLOAD_FILES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.value.steps.map((step) => step.businessName);
    // Only the GET body's own call (getCategories) should be inlined — the
    // exact bug found in the user's real E-commerce project, where the
    // wrong same-named overload's steps were rendered entirely
    // (docs/sprints/SPRINT-7.md).
    expect(names.some((name) => /Categor(y|ies)/i.test(name))).toBe(true);
    expect(names).not.toContain('Create Product');
    expect(names).not.toContain('Save Product');
  });

  it('resolves the POST overload (one param) to its own body, not the GET one', () => {
    if (!postAddProduct) throw new Error('POST addProduct overload not found');
    const result = inferBusinessFlow(
      api({ methodName: 'addProduct', httpMethod: 'POST', line: postAddProduct.line, className: 'ProductAdminController', file: 'ProductAdminController.java' }),
      OVERLOAD_FILES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.value.steps.map((step) => step.businessName);
    expect(names).toContain('Create Product');
    expect(names).toContain('Redirect to Admin Products');
    expect(names.some((name) => /Categor(y|ies)/i.test(name))).toBe(false);
  });
});

describe('inferBusinessFlow — real-world patterns (docs/sprints/SPRINT-7.md)', () => {
  it('resolves a this-qualified field call across files, not silently dropping it', () => {
    const result = inferBusinessFlow(api({ methodName: 'addProduct' }), FILES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The controller's `this.productService.addProduct(product)` is
    // resolved and inlined, so ProductService's own
    // `this.productRepository.save(product)` — also this-qualified —
    // shows up in the flow as its own step.
    const names = result.value.steps.map((step) => step.businessName);
    expect(names).toContain('Save Product');
  });

  it('recognizes the builder pattern as constructing a Product, not a step literally named "Builder"', () => {
    const result = inferBusinessFlow(api({ methodName: 'addProduct' }), FILES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.value.steps.map((step) => step.businessName);
    expect(names).toContain('Create Product');
    expect(names.some((name) => name.toLowerCase() === 'builder')).toBe(false);
  });

  it('names a redirect return after its target, not a generic "Return Response"', () => {
    const result = inferBusinessFlow(api({ methodName: 'addProduct' }), FILES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.value.steps.map((step) => step.businessName);
    expect(names).toContain('Redirect to Admin Products');
    expect(names).not.toContain('Return Response');
  });

  it('differentiates two addAttribute calls with different keys, and names the plain view-name return', () => {
    const result = inferBusinessFlow(
      api({ methodName: 'index', httpMethod: 'GET', path: '/admin/index' }),
      FILES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.value.steps.map((step) => step.businessName);
    // The exact bug reported: two different addAttribute calls must not
    // render as identical text.
    expect(names).toContain('Prepare "username" for Display');
    expect(names).toContain('Prepare "role" for Display');
    expect(names).toContain('Show Index Page');
  });
});

const HELPER_METHOD_SOURCE = `
  package com.example;

  @Controller
  @RequestMapping("/admin")
  public class ProductAdminController {
      private static final String REDIRECT_ADMIN_PRODUCTS = "redirect:/admin/products";
      private final ProductService productService;
      private final CategoryService categoryService;

      @PostMapping("products/add")
      public String addProduct(String name, int categoryId, int price) {
          Product product = buildProduct(name, categoryId, price);
          this.productService.addProduct(product);
          return REDIRECT_ADMIN_PRODUCTS;
      }

      private Product buildProduct(String name, int categoryId, int price) {
          Category category = this.categoryService.getCategory(categoryId);
          Product product = new Product();
          product.setName(name);
          product.setCategory(category);
          product.setPrice(price);
          return product;
      }
  }
`;

describe('inferBusinessFlow — private helper self-calls and constant-named returns (docs/sprints/SPRINT-7.md)', () => {
  const HELPER_FILES = [projectFile('ProductAdminController.java', HELPER_METHOD_SOURCE)];

  it('inlines a bare self-call to a private same-class helper method', () => {
    // `buildProduct(...)` — a bare call with no `this.`/field target — is
    // a self-call, resolved against the owning type itself just like a
    // field-qualified one. Found in the user's real AdminController.addProduct,
    // where the previous behavior missed the whole helper's steps.
    const result = inferBusinessFlow(
      api({
        methodName: 'addProduct',
        className: 'ProductAdminController',
        file: 'ProductAdminController.java',
      }),
      HELPER_FILES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.value.steps.map((step) => step.businessName);
    expect(names).toContain('Set Name');
    expect(names).toContain('Set Category');
    expect(names).toContain('Set Price');
  });

  it("resolves a return of a private static final String constant to its literal value, not a generic response", () => {
    const result = inferBusinessFlow(
      api({
        methodName: 'addProduct',
        className: 'ProductAdminController',
        file: 'ProductAdminController.java',
      }),
      HELPER_FILES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.value.steps.map((step) => step.businessName);
    expect(names).toContain('Redirect to Admin Products');
    expect(names).not.toContain('Return Response');
  });
});

const LOGIN_SOURCE = `
  package com.example;

  @Controller
  public class UserController {
      @GetMapping("/login")
      public ModelAndView userLogin(String error) {
          ModelAndView mv = new ModelAndView("userLogin");
          if ("true".equals(error)) {
              mv.addObject("msg", "Please enter correct email and password");
          }
          return mv;
      }
  }
`;

describe('inferBusinessFlow — a no-else if whose body falls through (docs/sprints/SPRINT-8.md)', () => {
  const LOGIN_FILES = [projectFile('UserController.java', LOGIN_SOURCE)];

  it('gives the decision two edges: the condition-true branch and the skip branch, correctly labeled', () => {
    // The real bug reported: a guard with no throw/return (just a side
    // effect, then fallthrough) was rendered with only ONE edge, and it
    // was mislabeled — the step that only runs when the condition is
    // true was shown as the "No" branch.
    const result = inferBusinessFlow(
      api({ methodName: 'userLogin', httpMethod: 'GET', path: '/login', className: 'UserController', file: 'UserController.java' }),
      LOGIN_FILES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { steps, edges } = result.value;

    const decision = steps.find((step) => step.type === 'decision');
    const msgStep = steps.find((step) => step.businessName.includes('msg'));
    const returnStep = steps.find((step) => step.businessName === 'Return Response');
    expect(decision).toBeDefined();
    expect(msgStep).toBeDefined();
    expect(returnStep).toBeDefined();
    if (!decision || !msgStep || !returnStep) return;

    const fromDecision = edges.filter((edge) => edge.from === decision.id);
    expect(fromDecision).toHaveLength(2);

    const toMsg = fromDecision.find((edge) => edge.to === msgStep.id);
    const toReturn = fromDecision.find((edge) => edge.to === returnStep.id);
    expect(toMsg?.label).toBe('Yes');
    expect(toReturn?.label).toBe('No');
  });
});

const REGISTER_SOURCE = `
  package com.example;

  @Controller
  public class UserController {
      private final UserService userService;

      @PostMapping("/register")
      public ModelAndView addUser(User user, boolean exists) {
          if (!exists) {
              user.setRole("ROLE_NORMAL");
              this.userService.addUser(user);
              return new ModelAndView("userLogin");
          } else {
              ModelAndView mView = new ModelAndView("register");
              mView.addObject("msg", "username is taken");
              return mView;
          }
      }
  }
`;

const PROFILE_SOURCE = `
  package com.example;

  @Controller
  public class UserController {
      @GetMapping("/profileDisplay")
      public String profileDisplay(Model model, User user) {
          if (user != null) {
              model.addAttribute("userid", user.getId());
          } else {
              model.addAttribute("msg", "User not found");
          }
          return "updateProfile";
      }
  }
`;

describe('inferBusinessFlow — a real if/else, both branches (docs/sprints/SPRINT-9.md)', () => {
  it('gives the decision two branches, each with its own real steps, when both branches return', () => {
    // Real pattern: UserController.addUser (E-commerce project) — the
    // `else` was previously dropped entirely.
    const FILES = [projectFile('UserController.java', REGISTER_SOURCE)];
    const result = inferBusinessFlow(
      api({ methodName: 'addUser', httpMethod: 'POST', path: '/register', className: 'UserController', file: 'UserController.java' }),
      FILES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { steps, edges } = result.value;

    const decision = steps.find((step) => step.type === 'decision');
    expect(decision).toBeDefined();
    if (!decision) return;

    const fromDecision = edges.filter((edge) => edge.from === decision.id);
    expect(fromDecision).toHaveLength(2);

    const names = steps.map((step) => step.businessName);
    // The then-branch's own steps (not absorbed into the decision or
    // dropped) and the else-branch's own step (previously dropped
    // entirely) are both present.
    expect(names).toContain('Set Role');
    expect(names).toContain('Add User');
    expect(names).toContain('Prepare "msg" for Display');
  });

  it('resumes shared trailing code from the branch that falls through, not both', () => {
    // Real pattern: UserController.profileDisplay / AdminController — both
    // branches only set a display value, then the method falls through to
    // one shared `return "updateProfile"`.
    const FILES = [projectFile('UserController.java', PROFILE_SOURCE)];
    const result = inferBusinessFlow(
      api({ methodName: 'profileDisplay', httpMethod: 'GET', path: '/profileDisplay', className: 'UserController', file: 'UserController.java' }),
      FILES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { steps, edges } = result.value;

    const decision = steps.find((step) => step.type === 'decision');
    const userIdStep = steps.find((step) => step.businessName.includes('userid'));
    const msgStep = steps.find((step) => step.businessName.includes('msg'));
    const pageStep = steps.find((step) => /Updateprofile|updateProfile/i.test(step.businessName));
    expect(decision).toBeDefined();
    expect(userIdStep).toBeDefined();
    expect(msgStep).toBeDefined();
    expect(pageStep).toBeDefined();
    if (!decision || !userIdStep || !msgStep || !pageStep) return;

    expect(edges.filter((edge) => edge.from === decision.id)).toHaveLength(2);
    // The trailing "show the page" step connects from exactly one branch's
    // tail (the else, per the documented arbitrary-but-consistent choice
    // when both branches fall through) — never left dangling off the
    // decision itself, and never duplicated onto both branches.
    const intoPage = edges.filter((edge) => edge.to === pageStep.id);
    expect(intoPage).toHaveLength(1);
    expect(intoPage[0]?.from).toBe(msgStep.id);
  });
});

const ASYMMETRIC_SOURCE = `
  package com.example;

  @Service
  public class StatusService {
      public String checkStatus(boolean ok) {
          if (ok) {
              return "success";
          } else {
              logFailure();
          }
          return "done";
      }
  }
`;

describe('inferBusinessFlow — an if/else where only one branch exits (docs/sprints/SPRINT-9.md)', () => {
  it('resumes trailing code from whichever branch does not return, not the branch that does', () => {
    const FILES = [projectFile('StatusService.java', ASYMMETRIC_SOURCE)];
    const result = inferBusinessFlow(
      api({ methodName: 'checkStatus', httpMethod: 'GET', path: '/status', className: 'StatusService', file: 'StatusService.java' }),
      FILES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { steps, edges } = result.value;

    const decision = steps.find((step) => step.type === 'decision');
    const logStep = steps.find((step) => /log/i.test(step.businessName));
    const doneStep = steps.find((step) => step.businessDescription.includes('done'));
    expect(decision).toBeDefined();
    expect(logStep).toBeDefined();
    expect(doneStep).toBeDefined();
    if (!decision || !logStep || !doneStep) return;

    const intoDone = edges.filter((edge) => edge.to === doneStep.id);
    expect(intoDone).toHaveLength(1);
    expect(intoDone[0]?.from).toBe(logStep.id);
  });
});

const SIGNIN_SOURCE = `
  package com.example;

  @Service
  public class AuthService {
      public User signin(Login login) {
          User user;
          try {
              utils.validateEmail(login.getUserName());
              user = authDao.getUserByEmail(login.getEmail());
          } catch (InvalidEmailFormatException e) {
              user = authDao.getUserByUserName(login.getUserName());
          }
          return user;
      }
  }
`;

const AUDIT_LOG_SOURCE = `
  package com.example;

  @Service
  public class AnalyzerService {
      public Analyze analyze(Long jdId) {
          try {
              Jd jd = jdRepository.findById(jdId);
              analyzeRepository.save(jd);
              activityService.record("SUCCESS");
              return jd;
          } catch (Exception e) {
              activityService.record("FAILURE");
              throw e;
          }
      }
  }
`;

describe('inferBusinessFlow — a real try/catch, both branches (docs/sprints/SPRINT-12.md)', () => {
  it('gives the catch clause its own visible step, hanging off the same point as the try-block, labeled by exception type', () => {
    // Real pattern: AuthService.signin — a catch clause used as an
    // alternate lookup strategy, not error handling.
    const FILES = [projectFile('AuthService.java', SIGNIN_SOURCE)];
    const result = inferBusinessFlow(
      api({ methodName: 'signin', httpMethod: 'POST', path: '/signin', className: 'AuthService', file: 'AuthService.java' }),
      FILES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { steps, edges } = result.value;

    const validateStep = steps.find((step) => step.businessName.includes('Validate'));
    const catchStep = steps.find((step) => step.businessName.includes('InvalidEmailFormatException'));
    expect(validateStep).toBeDefined();
    expect(catchStep).toBeDefined();
    if (!validateStep || !catchStep) return;

    // The catch step connects via an 'error'-type edge labeled with the
    // exception type, from the same point the try-block's own first step
    // connects from (not chained after the try-block).
    const intoCatch = edges.filter((edge) => edge.to === catchStep.id);
    expect(intoCatch).toHaveLength(1);
    expect(intoCatch[0]?.type).toBe('error');
    expect(intoCatch[0]?.label).toBe('InvalidEmailFormatException');

    const intoValidate = edges.filter((edge) => edge.to === validateStep.id);
    expect(intoValidate).toHaveLength(1);
    expect(intoValidate[0]?.from).toBe(intoCatch[0]?.from);
  });

  it('resumes trailing code from the try-block when both branches are non-terminal', () => {
    const FILES = [projectFile('AuthService.java', SIGNIN_SOURCE)];
    const result = inferBusinessFlow(
      api({ methodName: 'signin', httpMethod: 'POST', path: '/signin', className: 'AuthService', file: 'AuthService.java' }),
      FILES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { steps, edges } = result.value;

    const getByEmailStep = steps.find((step) => step.businessName.includes('By Email'));
    const getByUserNameStep = steps.find((step) => step.businessName.includes('User Name'));
    const returnStep = steps.find((step) => step.type === 'response');
    expect(getByEmailStep).toBeDefined();
    expect(getByUserNameStep).toBeDefined();
    expect(returnStep).toBeDefined();
    if (!getByEmailStep || !getByUserNameStep || !returnStep) return;

    const intoReturn = edges.filter((edge) => edge.to === returnStep.id);
    expect(intoReturn).toHaveLength(1);
    expect(intoReturn[0]?.from).toBe(getByEmailStep.id);
    // The catch branch's own tail (the alternate lookup) is a dead end —
    // the single-cursor model can only resume from one branch.
    expect(edges.some((edge) => edge.from === getByUserNameStep.id)).toBe(false);
  });

  it('gives both the try-block and the catch clause their own dead end when both branches are terminal', () => {
    // Real pattern: AnalyzerService.analyze — success path returns,
    // failure path logs and rethrows. Neither branch should produce a
    // dangling "resume" step, since nothing follows in well-formed code.
    const FILES = [projectFile('AnalyzerService.java', AUDIT_LOG_SOURCE)];
    const result = inferBusinessFlow(
      api({ methodName: 'analyze', httpMethod: 'POST', path: '/analyze', className: 'AnalyzerService', file: 'AnalyzerService.java' }),
      FILES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { steps, edges } = result.value;

    const successLogStep = steps.find((step) => step.technicalName.includes('"SUCCESS"'));
    const failureLogStep = steps.find((step) => step.technicalName.includes('"FAILURE"'));
    const catchStep = steps.find((step) => step.businessName.includes('Exception'));
    expect(successLogStep).toBeDefined();
    expect(failureLogStep).toBeDefined();
    expect(catchStep).toBeDefined();
    if (!successLogStep || !failureLogStep || !catchStep) return;

    // Both the try-block's tail (a terminal return) and the catch's tail
    // (a terminal throw) are genuine dead ends — no edges out of either.
    expect(edges.some((edge) => edge.from === successLogStep.id)).toBe(true); // -> the return step
    expect(edges.some((edge) => edge.from === failureLogStep.id)).toBe(true); // -> the rethrow step
    const returnStep = steps.find((step) => step.type === 'response');
    const rethrowStep = steps.find(
      (step) => step.type === 'error' && step.id !== catchStep.id,
    );
    expect(returnStep && edges.some((edge) => edge.to === returnStep.id && edge.from === successLogStep.id)).toBe(
      true,
    );
    expect(
      rethrowStep && edges.some((edge) => edge.to === rethrowStep.id && edge.from === failureLogStep.id),
    ).toBe(true);
    // Neither the return nor the rethrow step has any further outgoing edge.
    expect(returnStep && edges.some((edge) => edge.from === returnStep.id)).toBe(false);
    expect(rethrowStep && edges.some((edge) => edge.from === rethrowStep.id)).toBe(false);
  });
});
