import React, { act } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OperatorLayout from '../app/operator/layout';

// Configure React act environment
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock minimal DOM environment for React 19 node execution
interface MockListeners {
  [event: string]: (e: Event) => void;
}
const listeners: MockListeners = {};

const mockDocument = {
  addEventListener: (type: string, fn: (e: Event) => void) => {
    listeners[type] = fn;
  },
  removeEventListener: (type: string) => {
    delete listeners[type];
  },
  createElement: (tag: string) => ({
    tagName: tag.toUpperCase(),
    nodeType: 1,
    style: {},
    setAttribute: () => {},
    removeAttribute: () => {},
    appendChild: () => {},
    removeChild: () => {},
    addEventListener: (type: string, fn: (e: Event) => void) => {
      listeners[type] = fn;
    },
    removeEventListener: (type: string) => {
      delete listeners[type];
    },
    ownerDocument: mockDocument,
  }),
  createTextNode: (text: string) => ({ nodeType: 3, nodeValue: text }),
  documentElement: { style: {} },
  defaultView: null as unknown,
};

class MockHTMLIFrameElement {}
class MockElement {}
class MockHTMLElement extends MockElement {}

const mockWindow = {
  addEventListener: () => {},
  removeEventListener: () => {},
  HTMLIFrameElement: MockHTMLIFrameElement,
  Element: MockElement,
  HTMLElement: MockHTMLElement,
  document: mockDocument,
  ownerDocument: mockDocument,
};
mockDocument.defaultView = mockWindow;

global.window = mockWindow as unknown as Window & typeof globalThis;
global.document = mockDocument as unknown as Document;
(globalThis as unknown as Record<string, unknown>).HTMLIFrameElement = MockHTMLIFrameElement;
(globalThis as unknown as Record<string, unknown>).Element = MockElement;
(globalThis as unknown as Record<string, unknown>).HTMLElement = MockHTMLElement;
if (!global.navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node' },
    configurable: true,
  });
}

// Navigation mocks
let mockPathname = '/operator/assignments';
const mockRouterReplace = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    replace: mockRouterReplace,
    push: mockRouterPush,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock OperatorAuthContext
let mockAuthState = {
  isAuthenticated: false,
  isLoading: false,
  operator: null as unknown,
  logout: vi.fn(),
};

vi.mock('@/lib/auth/OperatorAuthContext', () => ({
  OperatorAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useOperatorAuth: () => mockAuthState,
}));

// Mock TopNav
vi.mock('@/components/operator/OperatorTopNav', () => ({
  OperatorTopNav: () => <nav data-testid="mock-operator-topnav">TopNav</nav>,
}));

describe('Regression: Operator Layout Unauthenticated Redirection Invariants', () => {
  let container: unknown;
  let root: ReactDOM.Root;

  beforeEach(() => {
    mockPathname = '/operator/assignments';
    mockRouterReplace.mockClear();
    mockRouterPush.mockClear();
    mockAuthState = {
      isAuthenticated: false,
      isLoading: false,
      operator: null,
      logout: vi.fn(),
    };
    container = mockDocument.createElement('div');
    root = ReactDOM.createRoot(container as HTMLElement);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
  });

  it('1. No navigation occurs during render body; redirection happens in useEffect after render', () => {
    let replacedDuringRender = false;

    // Track if router.replace was called before children / harness rendered
    function RenderInspector({ children }: { children: React.ReactNode }) {
      if (mockRouterReplace.mock.calls.length > 0) {
        replacedDuringRender = true;
      }
      return <>{children}</>;
    }

    mockAuthState = {
      isAuthenticated: false,
      isLoading: false,
      operator: null,
      logout: vi.fn(),
    };

    act(() => {
      root.render(
        <RenderInspector>
          <OperatorLayout>
            <div data-testid="workspace">Protected Assignments Content</div>
          </OperatorLayout>
        </RenderInspector>,
      );
    });

    // router.replace MUST NOT have been called during the render phase
    expect(replacedDuringRender).toBe(false);

    // After effect runs, unauthenticated user is redirected with destination query param
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith(
      '/operator/login?from=%2Foperator%2Fassignments',
    );
  });

  it('2. Does not redirect while session verification is loading (isLoading: true)', () => {
    mockAuthState = {
      isAuthenticated: false,
      isLoading: true,
      operator: null,
      logout: vi.fn(),
    };

    act(() => {
      root.render(
        <OperatorLayout>
          <div>Protected Content</div>
        </OperatorLayout>,
      );
    });

    // Verification in flight: no navigation
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('3. Does not redirect when current route is already /operator/login', () => {
    mockPathname = '/operator/login';
    mockAuthState = {
      isAuthenticated: false,
      isLoading: false,
      operator: null,
      logout: vi.fn(),
    };

    act(() => {
      root.render(
        <OperatorLayout>
          <div data-testid="login-form">Standalone Login Form</div>
        </OperatorLayout>,
      );
    });

    // On login page itself: no redirection loop
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('4. Does not redirect when operator is authenticated (isAuthenticated: true)', () => {
    mockPathname = '/operator/map';
    mockAuthState = {
      isAuthenticated: true,
      isLoading: false,
      operator: { id: 'op-1', username: 'eoc_operator', role: 'ADMIN' },
      logout: vi.fn(),
    };

    act(() => {
      root.render(
        <OperatorLayout>
          <div data-testid="map-content">Live Map Content</div>
        </OperatorLayout>,
      );
    });

    // Authenticated: no navigation
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('5. Transitions from loading to unauthenticated and triggers redirect after verification finishes', () => {
    // Start with session verification loading
    mockAuthState = {
      isAuthenticated: false,
      isLoading: true,
      operator: null,
      logout: vi.fn(),
    };

    act(() => {
      root.render(
        <OperatorLayout>
          <div>Protected Overview</div>
        </OperatorLayout>,
      );
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();

    // Verification completes: operator is unauthenticated
    mockAuthState = {
      isAuthenticated: false,
      isLoading: false,
      operator: null,
      logout: vi.fn(),
    };

    act(() => {
      root.render(
        <OperatorLayout>
          <div>Protected Overview</div>
        </OperatorLayout>,
      );
    });

    // Now redirect occurs safely in useEffect
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith(
      '/operator/login?from=%2Foperator%2Fassignments',
    );
  });
});
