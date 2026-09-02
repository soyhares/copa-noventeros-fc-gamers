// 1. Ve a https://console.firebase.google.com y crea un proyecto (gratis).
// 2. Dentro del proyecto: "Compilación" > "Firestore Database" > "Crear base de datos"
//    (elige modo de producción o de prueba, ver README.md para las reglas).
// 3. Ve a "Configuración del proyecto" (ícono de engranaje) > pestaña "General".
// 4. En "Tus apps", agrega una app Web (ícono </>), ponle un apodo y regístrala.
// 5. Firebase te mostrará un objeto firebaseConfig como el de abajo: reemplaza
//    estos valores de ejemplo por los tuyos (SÍ es seguro subir esta apiKey a
//    GitHub público: no es un secreto, es una llave de identificación del
//    proyecto, no de acceso — la seguridad real la dan las reglas de Firestore).

export const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx"
};
