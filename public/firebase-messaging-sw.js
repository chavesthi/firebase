// firebase-messaging-sw.js

// Importa os scripts necessários para FCM funcionar no service worker
importScripts('https://www.gstatic.com/firebasejs/10.11.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.11.1/firebase-messaging-compat.js');

// Sua configuração real do Firebase (igual ao seu firebase.ts)
const firebaseConfig = {
  apiKey: "AIzaSyBeWIuua2ILzwVdJpw7bf5uYGpCVCt549o",
  authDomain: "fervoappusuarioeparceiro.firebaseapp.com",
  databaseURL: "https://fervoappusuarioeparceiro-default-rtdb.firebaseio.com",
  projectId: "fervoappusuarioeparceiro",
  storageBucket: "fervoappusuarioeparceiro.appspot.com",
  messagingSenderId: "762698655248",
  appId: "1:762698655248:web:1a4a995fccd6bcf6cb0c95",
  measurementId: "G-3QD4RQHSMQ"
};

// Inicializa o app Firebase no Service Worker
firebase.initializeApp(firebaseConfig);

// Inicializa o Firebase Messaging
const messaging = firebase.messaging();

// Listener para mensagens em segundo plano
messaging.onBackgroundMessage(function (payload) {
  console.log('[firebase-messaging-sw.js] Mensagem recebida em segundo plano:', payload);

  const notificationTitle = payload.notification.title || "Notificação";
  const notificationOptions = {
    body: payload.notification.body || "Você recebeu uma nova mensagem.",
    icon: payload.notification.icon || "/logo.png", // Ícone opcional
    data: {
      url: payload.data?.url || "/" // Redirecionamento ao clicar na notificação
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Evento de clique na notificação
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
