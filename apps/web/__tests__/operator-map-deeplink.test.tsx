import React, { act } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { RescueRequest } from '@floodrelay/shared';
import type { SelectedMapEntity } from '../components/operator/map/LeafletMapCanvas';
import { useMapSelection } from '../hooks/useMapSelection';

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

// Sample test requests
const sampleRequests: RescueRequest[] = [
  {
    id: 'req-alpha',
    lat: 28.65,
    lng: 77.23,
    peopleCount: 4,
    urgency: 'CRITICAL',
    source: 'REPORTED',
    status: 'PENDING',
    createdAt: '2026-11-08T10:00:00.000Z',
  },
  {
    id: 'req-beta',
    lat: 28.66,
    lng: 77.24,
    peopleCount: 2,
    urgency: 'HIGH',
    source: 'REPORTED',
    status: 'PENDING',
    createdAt: '2026-11-08T10:05:00.000Z',
  },
  {
    id: 'req-gamma',
    lat: 28.67,
    lng: 77.25,
    peopleCount: 6,
    urgency: 'MEDIUM',
    source: 'REPORTED',
    status: 'PENDING',
    createdAt: '2026-11-08T10:10:00.000Z',
  },
];

interface HarnessHandle {
  getSelected: () => SelectedMapEntity;
  manualSelect: (entity: SelectedMapEntity) => void;
  getFocusedRef: () => string | null;
  getHasInitializedDefault: () => boolean;
}

// Test harness component mounting useMapSelection
function MapSelectionTestHarness({
  requests,
  requestedId,
  onMount,
}: {
  requests: RescueRequest[];
  requestedId: string | null;
  onMount: (handle: HarnessHandle) => void;
}) {
  const { selectedEntity, setSelectedEntity, focusedRequestIdRef, hasInitializedDefaultRef } =
    useMapSelection({ requests, requestedId });

  onMount({
    getSelected: () => selectedEntity,
    manualSelect: (e) => setSelectedEntity(e),
    getFocusedRef: () => focusedRequestIdRef.current,
    getHasInitializedDefault: () => hasInitializedDefaultRef.current,
  });

  return null;
}

describe('Mounted React Regression: Live Map Deep-Linking, Manual Selection & Rerender Stability', () => {
  let container: unknown;
  let root: ReactDOM.Root;

  beforeEach(() => {
    container = mockDocument.createElement('div');
    root = ReactDOM.createRoot(container as HTMLElement);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
  });

  it('1. Deep-link focus: focuses requested incident once when loaded from URL query param', () => {
    let handle!: HarnessHandle;

    act(() => {
      root.render(
        <MapSelectionTestHarness
          requests={sampleRequests}
          requestedId="req-beta"
          onMount={(h) => {
            handle = h;
          }}
        />,
      );
    });

    const selected = handle.getSelected();
    expect(selected).not.toBeNull();
    expect(selected?.type).toBe('incident');
    expect(selected?.item?.id).toBe('req-beta');
    expect(handle.getFocusedRef()).toBe('req-beta');
  });

  it('2. Manual selection: preserves user selection when clicking another marker without being overridden', () => {
    let handle!: HarnessHandle;

    // Mount with deep-link focusing req-beta
    act(() => {
      root.render(
        <MapSelectionTestHarness
          requests={sampleRequests}
          requestedId="req-beta"
          onMount={(h) => {
            handle = h;
          }}
        />,
      );
    });

    expect(handle.getSelected()?.item?.id).toBe('req-beta');

    // Operator manually selects req-alpha (e.g. clicked on map marker)
    act(() => {
      handle.manualSelect({ type: 'incident', item: sampleRequests[0] });
    });

    // Verification: Manual selection is active and NOT overridden back to req-beta
    expect(handle.getSelected()?.type).toBe('incident');
    expect(handle.getSelected()?.item?.id).toBe('req-alpha');
  });

  it('3. Rerender stability: preserves manual selection across Live Polling request array updates', () => {
    let handle!: HarnessHandle;

    // 1. Initial mount with deep-link
    act(() => {
      root.render(
        <MapSelectionTestHarness
          requests={sampleRequests}
          requestedId="req-beta"
          onMount={(h) => {
            handle = h;
          }}
        />,
      );
    });

    expect(handle.getSelected()?.item?.id).toBe('req-beta');

    // 2. Operator manually selects req-gamma
    act(() => {
      handle.manualSelect({ type: 'incident', item: sampleRequests[2] });
    });

    expect(handle.getSelected()?.item?.id).toBe('req-gamma');

    // 3. Simulate Live 20-second Polling update: new requests array reference with updated timestamp
    const polledRequests: RescueRequest[] = sampleRequests.map((r) => ({
      ...r,
      updatedAt: '2026-11-08T10:20:00.000Z',
    }));

    act(() => {
      root.render(
        <MapSelectionTestHarness
          requests={polledRequests}
          requestedId="req-beta"
          onMount={(h) => {
            handle = h;
          }}
        />,
      );
    });

    // Verification: Manual selection req-gamma was NOT reset to req-beta!
    expect(handle.getSelected()?.type).toBe('incident');
    expect(handle.getSelected()?.item?.id).toBe('req-gamma');
  });

  it('4. Default fallback: selects first CRITICAL incident when no deep-link is provided, and preserves subsequent manual selection', () => {
    let handle!: HarnessHandle;

    // Mount without requestedId
    act(() => {
      root.render(
        <MapSelectionTestHarness
          requests={sampleRequests}
          requestedId={null}
          onMount={(h) => {
            handle = h;
          }}
        />,
      );
    });

    // Should default to first CRITICAL request (req-alpha)
    expect(handle.getSelected()?.item?.id).toBe('req-alpha');
    expect(handle.getHasInitializedDefault()).toBe(true);

    // Operator manually selects req-beta
    act(() => {
      handle.manualSelect({ type: 'incident', item: sampleRequests[1] });
    });

    expect(handle.getSelected()?.item?.id).toBe('req-beta');

    // Simulate Live Polling rerender
    const polledRequests = [...sampleRequests];
    act(() => {
      root.render(
        <MapSelectionTestHarness
          requests={polledRequests}
          requestedId={null}
          onMount={(h) => {
            handle = h;
          }}
        />,
      );
    });

    // Manual selection preserved
    expect(handle.getSelected()?.item?.id).toBe('req-beta');
  });

  it('5. Non-existent deep link: handles missing request ID without crash and marks focused', () => {
    let handle!: HarnessHandle;

    act(() => {
      root.render(
        <MapSelectionTestHarness
          requests={sampleRequests}
          requestedId="req-nonexistent"
          onMount={(h) => {
            handle = h;
          }}
        />,
      );
    });

    expect(handle.getFocusedRef()).toBe('req-nonexistent');
    // Does not throw error, selectedEntity remains null or initial
  });

  it('6. Dynamic URL change: focuses new incident when deep-link target changes in URL', () => {
    let handle!: HarnessHandle;

    // 1. Initial mount with req-alpha
    act(() => {
      root.render(
        <MapSelectionTestHarness
          requests={sampleRequests}
          requestedId="req-alpha"
          onMount={(h) => {
            handle = h;
          }}
        />,
      );
    });

    expect(handle.getSelected()?.item?.id).toBe('req-alpha');

    // 2. User navigates to ?requestId=req-gamma
    act(() => {
      root.render(
        <MapSelectionTestHarness
          requests={sampleRequests}
          requestedId="req-gamma"
          onMount={(h) => {
            handle = h;
          }}
        />,
      );
    });

    // Should re-focus to req-gamma
    expect(handle.getSelected()?.item?.id).toBe('req-gamma');
    expect(handle.getFocusedRef()).toBe('req-gamma');
  });
});
