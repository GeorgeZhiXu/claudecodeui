import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for the keyboard shortcut logic used in useChatComposerState's handleKeyDown.
 *
 * The core logic under test (from useChatComposerState.ts lines 813-825):
 *
 *   if (event.key === 'Enter') {
 *     if (event.nativeEvent.isComposing) { return; }
 *     if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
 *       event.preventDefault();
 *       handleSubmit(event);
 *     } else if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !sendByCtrlEnter) {
 *       event.preventDefault();
 *       handleSubmit(event);
 *     }
 *   }
 *
 * We extract this logic into a pure function to unit-test all keyboard shortcut
 * edge cases independently of React rendering.
 */

interface KeyDownEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  nativeEvent: { isComposing: boolean };
  preventDefault: () => void;
}

interface HandleKeyDownOptions {
  sendByCtrlEnter: boolean;
  handleSubmit: (event: KeyDownEvent) => void;
}

/**
 * Pure function that mirrors the Enter-key handling logic from useChatComposerState.
 * This is a faithful reproduction of lines 813-825 of useChatComposerState.ts,
 * enabling isolated testing without needing to render React components.
 */
function handleEnterKeyLogic(event: KeyDownEvent, options: HandleKeyDownOptions): boolean {
  const { sendByCtrlEnter, handleSubmit } = options;

  if (event.key !== 'Enter') {
    return false;
  }

  if (event.nativeEvent.isComposing) {
    return false;
  }

  if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
    event.preventDefault();
    handleSubmit(event);
    return true;
  }

  if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !sendByCtrlEnter) {
    event.preventDefault();
    handleSubmit(event);
    return true;
  }

  return false;
}

function createMockEvent(overrides: Partial<KeyDownEvent> = {}): KeyDownEvent {
  return {
    key: 'Enter',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    nativeEvent: { isComposing: false },
    preventDefault: vi.fn(),
    ...overrides,
  };
}

describe('Chat keyboard shortcut - Ctrl+Enter / Cmd+Enter to submit', () => {
  describe('Ctrl+Enter (Windows/Linux)', () => {
    it('should submit when Ctrl+Enter is pressed', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({ ctrlKey: true });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(handleSubmit).toHaveBeenCalledOnce();
      expect(handleSubmit).toHaveBeenCalledWith(event);
    });

    it('should submit when Ctrl+Enter is pressed even when sendByCtrlEnter is enabled', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({ ctrlKey: true });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: true, handleSubmit });

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(handleSubmit).toHaveBeenCalledOnce();
    });
  });

  describe('Cmd+Enter (Mac)', () => {
    it('should submit when Cmd+Enter is pressed', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({ metaKey: true });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(handleSubmit).toHaveBeenCalledOnce();
      expect(handleSubmit).toHaveBeenCalledWith(event);
    });

    it('should submit when Cmd+Enter is pressed even when sendByCtrlEnter is enabled', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({ metaKey: true });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: true, handleSubmit });

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(handleSubmit).toHaveBeenCalledOnce();
    });
  });

  describe('Shift+Enter (newline preservation)', () => {
    it('should NOT submit when Shift+Enter is pressed (preserves newline)', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({ shiftKey: true });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(handleSubmit).not.toHaveBeenCalled();
    });

    it('should NOT submit when Shift+Ctrl+Enter is pressed', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({ shiftKey: true, ctrlKey: true });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(handleSubmit).not.toHaveBeenCalled();
    });

    it('should NOT submit when Shift+Cmd+Enter is pressed', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({ shiftKey: true, metaKey: true });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(handleSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Enter alone (default mode)', () => {
    it('should submit when Enter alone is pressed and sendByCtrlEnter is false', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent();

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(handleSubmit).toHaveBeenCalledOnce();
    });

    it('should NOT submit when Enter alone is pressed and sendByCtrlEnter is true', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent();

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: true, handleSubmit });

      expect(result).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(handleSubmit).not.toHaveBeenCalled();
    });
  });

  describe('IME composing', () => {
    it('should NOT submit when IME is composing (Enter during composition)', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({
        nativeEvent: { isComposing: true },
      });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(handleSubmit).not.toHaveBeenCalled();
    });

    it('should NOT submit when IME is composing even with Ctrl held', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({
        ctrlKey: true,
        nativeEvent: { isComposing: true },
      });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(handleSubmit).not.toHaveBeenCalled();
    });

    it('should NOT submit when IME is composing even with Cmd held', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({
        metaKey: true,
        nativeEvent: { isComposing: true },
      });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(handleSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Non-Enter keys', () => {
    it('should not handle non-Enter key events', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({ key: 'a' });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(handleSubmit).not.toHaveBeenCalled();
    });

    it('should not handle Tab key events', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({ key: 'Tab' });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(false);
      expect(handleSubmit).not.toHaveBeenCalled();
    });

    it('should not handle Escape key events', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({ key: 'Escape' });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(false);
      expect(handleSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Cross-browser compatibility', () => {
    it('should handle both ctrlKey and metaKey simultaneously', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent({ ctrlKey: true, metaKey: true });

      const result = handleEnterKeyLogic(event, { sendByCtrlEnter: false, handleSubmit });

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(handleSubmit).toHaveBeenCalledOnce();
    });
  });

  describe('sendByCtrlEnter mode', () => {
    it('Ctrl+Enter always submits regardless of sendByCtrlEnter setting', () => {
      const handleSubmit = vi.fn();

      // sendByCtrlEnter = false
      const event1 = createMockEvent({ ctrlKey: true });
      handleEnterKeyLogic(event1, { sendByCtrlEnter: false, handleSubmit });
      expect(handleSubmit).toHaveBeenCalledTimes(1);

      // sendByCtrlEnter = true
      const event2 = createMockEvent({ ctrlKey: true });
      handleEnterKeyLogic(event2, { sendByCtrlEnter: true, handleSubmit });
      expect(handleSubmit).toHaveBeenCalledTimes(2);
    });

    it('Cmd+Enter always submits regardless of sendByCtrlEnter setting', () => {
      const handleSubmit = vi.fn();

      // sendByCtrlEnter = false
      const event1 = createMockEvent({ metaKey: true });
      handleEnterKeyLogic(event1, { sendByCtrlEnter: false, handleSubmit });
      expect(handleSubmit).toHaveBeenCalledTimes(1);

      // sendByCtrlEnter = true
      const event2 = createMockEvent({ metaKey: true });
      handleEnterKeyLogic(event2, { sendByCtrlEnter: true, handleSubmit });
      expect(handleSubmit).toHaveBeenCalledTimes(2);
    });

    it('Enter alone is blocked when sendByCtrlEnter is enabled', () => {
      const handleSubmit = vi.fn();
      const event = createMockEvent();

      handleEnterKeyLogic(event, { sendByCtrlEnter: true, handleSubmit });

      expect(handleSubmit).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });
});
