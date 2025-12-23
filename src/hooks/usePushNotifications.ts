
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Chave pública VAPID
const VAPID_PUBLIC_KEY = 'BOax6fCxWvdPkjR_z_qlnVq4tr3Ni_eTJazAMWDIZNSkBHvvrfs1qdZeMXVjQ0IyP762aJR1bdO4n70leWijFy8';

// Função para converter a chave VAPID para o formato correto
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(registration => {
        registration.pushManager.getSubscription().then(sub => {
          if (sub) {
            setIsSubscribed(true);
          }
        });
      });
    }
  }, []);

  const subscribeToPush = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");

      // Salva a inscrição no banco de dados
      const { error: dbError } = await supabase.from('push_subscriptions').insert({
        user_id: user.id,
        subscription_details: sub.toJSON(),
      });

      if (dbError) throw dbError;

      setIsSubscribed(true);
      setError(null);
    } catch (err: any) {
      console.error('Falha ao se inscrever nas notificações push', err);
      setError(err.message || 'Ocorreu um erro.');
    }
  };

  return { isSubscribed, subscribeToPush, error };
}
