self.addEventListener('push', function(event) {
  const data = event.data.json();
  console.log('Push notification recebida:', data);

  const options = {
    body: data.body,
    icon: '/vite.svg', // Ícone padrão do seu projeto
    badge: '/vite.svg', // Ícone para a barra de notificações
    data: {
      url: data.url || '/', // URL para abrir ao clicar na notificação
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  // Foca em uma janela existente do app ou abre uma nova
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow(event.notification.data.url || '/');
    })
  );
});
