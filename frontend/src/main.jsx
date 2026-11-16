import React from 'react';
import { createRoot } from 'react-dom/client';
import { OrderPage } from './pages/OrderPage';
import { BarPage } from './pages/BarPage';
import { Sky } from './components/Sky';
import './styles/club.css';
import './styles/order.css';

const Page = location.pathname.includes('bar.html') ? BarPage : OrderPage;

class PageErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="w" style={{ paddingTop: 100 }} role="alert">
          <h1>Не удалось открыть страницу</h1>
          <p>Обновите страницу. Если ошибка повторится, обратитесь к администратору клуба.</p>
          <button className="btn" onClick={() => location.reload()}>
            Обновить
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <PageErrorBoundary>
    <Sky />
    <Page />
  </PageErrorBoundary>,
);
