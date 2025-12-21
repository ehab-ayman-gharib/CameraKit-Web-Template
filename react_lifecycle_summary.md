# React Lifecycle & Hooks Summary

This document summarizes the key React rules regarding State, Re-renders, and `useEffect` behavior, based on our discussion about the CameraKit implementation.

## 1. The Core Loop: State Update -> Re-render
When you call a state setter (e.g., `setCapturedImage(...)`), React initiates a re-render cycle for that component.

1.  **Trigger**: State changes.
2.  **Render Phase**: React executes your component function (`CameraKitWrapper`) from top to bottom.
    *   All local variables are recreated.
    *   `useState` hooks return the *new* current value.
    *   The `return (...)` statement generates a new Virtual DOM tree (the UI structure).
3.  **Commit Phase**: React compares the new Virtual DOM with the old one and updates the actual DOM (e.g., hiding the canvas, showing the `<img>` tag).

## 2. The `useEffect` Rule
`useEffect` runs **after** the render is committed to the screen. It does not run *during* the component function execution.

### How React Decides to Run an Effect
After every render, React looks at the **Dependency Array** (the second argument to `useEffect`).

```typescript
useEffect(() => {
    // Effect Logic
}, [dependency1, dependency2]);
```

*   **If Dependencies Changed**: React runs the **Cleanup Function** (if one exists) from the *previous* run, and then runs the **Effect Logic** again.
*   **If Dependencies Did NOT Change**: React **skips** the effect entirely. It does nothing. The previous effect instance remains active.

## 3. The "Capture Photo" Example
In our specific case:

```typescript
const [capturedImage, setCapturedImage] = useState(null);
const [facingMode, setFacingMode] = useState('user');

useEffect(() => {
    // Start Camera Stream
    return () => { /* Stop Stream */ };
}, [facingMode]); // Dependency: Only facingMode
```

### Scenario: Taking a Photo
When you call `setCapturedImage(dataUrl)`:

1.  **Component Re-renders**: The `CameraKitWrapper` function runs. The UI updates to show the photo.
2.  **Effect Check**: React checks the `useEffect` for the camera stream.
    *   It asks: "Did `facingMode` change?"
    *   Answer: **No**.
3.  **Outcome**:
    *   The **Cleanup Function** (Stop Stream) does **NOT** run. The camera keeps running in the background.
    *   The **Effect Logic** (Start Stream) does **NOT** run.
    *   The UI is updated, but the heavy "side effect" (camera logic) is undisturbed.

### Scenario: Flipping the Camera
When you call `setFacingMode('environment')`:

1.  **Component Re-renders**: The function runs.
2.  **Effect Check**: React checks the `useEffect`.
    *   It asks: "Did `facingMode` change?"
    *   Answer: **Yes** ('user' -> 'environment').
3.  **Outcome**:
    *   React runs the **Cleanup Function** from the *previous* render (stopping the old 'user' stream).
    *   React runs the **Effect Logic** (starting the new 'environment' stream).

## Summary
*   **Re-rendering** updates the **View** (JSX/UI). It happens on *every* state change.
*   **Effects** manage **Side Processes** (Data fetching, Subscriptions, Camera Streams). They happen *only* when their specific dependencies change.
*   This separation allows you to update the UI (like showing a photo overlay) without restarting expensive background processes (like the camera stream).
