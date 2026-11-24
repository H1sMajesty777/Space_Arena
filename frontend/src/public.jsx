import { createRoot } from 'react-dom/client';
import { PublicPage } from './pages/PublicPage';
import './styles/arena.css';
import './styles/arena-mobile.css';

createRoot(document.getElementById('root')).render(<PublicPage />);
