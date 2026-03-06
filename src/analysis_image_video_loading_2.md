# Analysis: Image and Video Loading in Edit Guide (CreateGuideScreen.jsx)

This analysis focuses on the current state of image and video handling within the `CreateGuideScreen.jsx` component, specifically when editing an existing guide.

---

## 1) Check CreateGuideScreen.jsx - what fields are in the step state object?

In `CreateGuideScreen.jsx`, the `steps` state is initialized with `{ id: uuidv4(), text: '' }`.
When loading an existing guide in the `useEffect` hook, the guide's steps are mapped and transformed: