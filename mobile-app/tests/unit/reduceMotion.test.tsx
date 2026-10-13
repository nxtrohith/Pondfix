import { AccessibilityInfo } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useReduceMotion } from '@/lib/useReduceMotion';

describe('useReduceMotion', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is false when the system does not ask for reduced motion', () => {
    const { result } = renderHook(() => useReduceMotion());
    expect(result.current).toBe(false);
  });

  it('becomes true when the system asks for reduced motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { result } = renderHook(() => useReduceMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });
});
