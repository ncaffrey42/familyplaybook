import { Navigate } from 'react-router-dom';

// Legacy route — bundles and packs are the same concept; /bundles is canonical.
const MyPacksScreen = () => <Navigate to="/bundles" replace />;
export default MyPacksScreen;
