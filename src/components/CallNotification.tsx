
import React from 'react';
import './CallNotification.css';

interface CallNotificationProps {
  caller: {
    full_name?: string;
    username?: string;
  };
  onAccept: () => void;
  onDecline: () => void;
}

const CallNotification: React.FC<CallNotificationProps> = ({ caller, onAccept, onDecline }) => {
  return (
    <div className="call-notification-overlay">
      <div className="call-notification-popup">
        <h2>Chamada Recebida</h2>
        <p>
          <strong>{caller.full_name || caller.username}</strong> está te ligando.
        </p>
        <div className="call-notification-actions">
          <button onClick={onAccept} className="accept-btn">Aceitar</button>
          <button onClick={onDecline} className="decline-btn">Recusar</button>
        </div>
      </div>
    </div>
  );
};

export default CallNotification;
