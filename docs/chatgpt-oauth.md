# ChatGPT mediante OAuth

Esta integración está destinada a Modus de código abierto ejecutado en el equipo del usuario, no a un servicio web comercial alojado remotamente. Usar Turso para los proyectos no cambia dónde se ejecuta el servidor de Modus.

Los scripts `pnpm dev` y `pnpm start` enlazan el servidor a `127.0.0.1`. No lo publiques en la red ni lo expongas mediante un proxy: los controles de origen y Host no sustituyen esta restricción de escucha local.

## Conectar y usar

1. Abre `http://127.0.0.1:3000` (o el puerto que utilices) y desbloquea tu perfil.
2. Entra en **Proveedores y conexiones** y pulsa **Continuar con ChatGPT**.
3. Completa la autorización oficial de OpenAI. El callback conserva `http://127.0.0.1:<puerto>/auth/callback`; `localhost` no es equivalente para este flujo.
4. Elige **ChatGPT · OAuth** y un modelo disponible para esa cuenta en el selector del chat.

Las solicitudes compatibles utilizan el plan de ChatGPT. OpenAI determina la elegibilidad y los límites. Puedes gestionarlos en [ChatGPT → Uso](https://chatgpt.com/settings/usage). Modus no cambia a otro proveedor ni a facturación API cuando falla una conexión o se alcanza un límite.

## Seguridad y desconexión

- Los tokens se cifran mediante Windows DPAPI y se guardan en `.local/chatgpt-oauth.sqlite`, separados de los proyectos y de Turso. Se requiere Windows; no se guardan tokens en el almacenamiento del navegador ni en Git.
- El log de solicitudes de desarrollo omite `/auth/callback` para no registrar el código de autorización. No habilites logs de URLs completas ni un proxy con logs de este callback.
- La sesión se renueva automáticamente. Si la renovación confirma expiración o revocación, conecta la cuenta de nuevo. Un fallo temporal de red no elimina la conexión.
- **Desconectar** elimina los tokens locales e intenta revocar la sesión renovable. Si no se confirma la revocación remota, desconecta también Modus desde los ajustes de ChatGPT.

Claude queda fuera de este alcance: [Anthropic no admite ofrecer login de Claude.ai dentro de aplicaciones de terceros](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use), y se decidió no añadir una alternativa con API key.

## Verificación manual con una cuenta propia

- Autorizar: comprobar estado conectado, cuenta visible y catálogo de modelos; enviar un mensaje breve.
- Cancelar: rechazar la autorización; comprobar que no aparece una conexión falsa ni se pierden las otras claves.
- Renovar: comprobar la renovación de una sesión expirada y la sustitución de tokens con fixtures, sin editar credenciales reales.
- Revocar: desconectar Modus desde ChatGPT; comprobar que una renovación rechazada pide reconectar.
- Error temporal: comprobar con fixtures que un fallo de red no borra la conexión ni cambia la facturación.
- Desconectar: comprobar que se impiden nuevos envíos, desaparece la selección utilizable y se muestra una advertencia si no se confirmó la revocación remota.

Esta lista no afirma que se hayan realizado pruebas con una cuenta real. Las comprobaciones con fixtures deben ejecutarse en un entorno aislado, sin credenciales reales ni acceso a servicios externos.

## Referencias oficiales

- [Registro y autorización](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Renovación y desconexión](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Modelos e inferencia](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Límites del flujo](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Interfaz y uso del plan](https://developers.openai.com/siwc/ui-ux-guidelines)
