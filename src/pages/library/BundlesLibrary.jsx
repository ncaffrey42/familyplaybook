import { Navigate } from 'react-router-dom';

// Legacy route — /library/packs is the canonical bundle library screen.
const BundlesLibrary = () => <Navigate to="/library/packs" replace />;
export default BundlesLibrary;
