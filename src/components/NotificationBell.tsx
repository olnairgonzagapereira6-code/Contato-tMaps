
import React from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications';

const NotificationBell: React.FC = () => {
  const { isSubscribed, subscribeToPush, error } = usePushNotifications();

  const handleSubscription = async () => {
    if (Notification.permission === 'denied') {
      alert('Você bloqueou as notificações. Por favor, habilite-as nas configurações do seu navegador.');
      return;
    }
    
    await subscribeToPush();
  };

  return (
    <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999 }}>
      <button onClick={handleSubscription} disabled={isSubscribed} style={buttonStyle(isSubscribed)}>
        {isSubscribed ? '✔️ Notificações Ativadas' : '🔔 Ativar Notificações'}
      </button>
      {error && <p style={{ color: 'red', fontSize: '12px' }}>Erro: {error}</p>}
    </div>
  );
};

// Estilos simples para o botão
const buttonStyle = (isSubscribed: boolean): React.CSSProperties => ({
  padding: '10px 15px',
  border: 'none',
  borderRadius: '8px',
  backgroundColor: isSubscribed ? '#4CAF50' : '#008CBA',
  color: 'white',
  cursor: isSubscribed ? 'default' : 'pointer',
  fontSize: '14px',
  fontWeight: 'bold',
  boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
});

export default NotificationBell;
