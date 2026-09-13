import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { AppShell } from './components/app-shell';
import { WelcomeRoute } from './routes/welcome';
import { WorkspaceRoute } from './routes/workspace';

const rootRoute = createRootRoute({
  component: AppShell,
});

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: WelcomeRoute,
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace',
  component: WorkspaceRoute,
});

const routeTree = rootRoute.addChildren([welcomeRoute, workspaceRoute]);

// A desktop app has no address bar — routing state lives only in memory.
export const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ['/'] }),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
