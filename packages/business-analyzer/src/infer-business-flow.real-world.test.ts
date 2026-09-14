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
