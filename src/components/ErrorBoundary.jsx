import React from 'react';
import { logError } from '@/lib/errorLogger';
import NotFoundScreen from '@/pages/NotFoundScreen';
import { useNavigate } from 'react-router-dom';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    logError(error, { componentStack: errorInfo.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return <ErrorBoundaryFallback />;
    }

    return this.props.children;
  }
}

const ErrorBoundaryFallback = () => {
  const navigate = useNavigate();
  return <NotFoundScreen />;
};

export { ErrorBoundary };
export default ErrorBoundary;