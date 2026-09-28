import {installSessionHealth} from './lib/sessionHealth';
import './lib/installPrompt';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
installSessionHealth();
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);
