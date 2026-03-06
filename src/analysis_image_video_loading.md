# Analysis: Image and Video Loading in Edit Guide

## 1. Investigation of CreateGuideScreen.jsx
Upon reviewing `src/components/CreateGuideScreen.jsx`, the following observations were made regarding how media is handled:

### Data Loading & Structure
- **Loading Logic**: The `useEffect` hook fetches the guide and maps `guide.steps` to the local state.
- **Data Preservation**: The mapping logic uses `{ ...s }` (spread operator). This implies that if `image_url`, `video_url`, or `media_type` fields exist in the database JSON objects, they **are** being loaded into the component state correctly.
- **Missing Rendering**: Despite the data being present in the state variable `steps`, the JSX render loop **does not use them**.
  - It renders a `textarea` for the text.
  - It renders static buttons for "Add Image" and "Add Video".
  - **Critical Finding**: These buttons have **no `onClick` handlers**. They are purely cosmetic placeholders at this stage.
  - There is no `<img>` or `<video>` tag, nor any media component, rendered within the step list to display existing media.

### Comparison with GuideDetail
- Typically, `GuideDetail` would look for properties like `image_url` or `video_url` on the step object to display content.
- `CreateGuideScreen` is currently completely disconnected from these properties visually.

## 2. Supabase Schema & Data
- The `guides` table uses a `steps` column of type `jsonb`.
- This structure is flexible and likely holds an array of objects: