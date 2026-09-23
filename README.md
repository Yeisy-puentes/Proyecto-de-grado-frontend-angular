# Interfajas — Frontend (Angular)

Frontend del sistema de gestión de arreglos textiles. Consume el backend
`Proyecto-de-grado-backend-node` (Node + Express + MySQL).

## Conexión con el backend

1. Levanta el backend (`npm run dev` en `Proyecto-de-grado-backend-node`, puerto 3000).
2. La URL de la API está en `src/environments/environment.development.ts` (desarrollo)
   y `src/environments/environment.ts` (producción): `http://localhost:3000/api`.
3. `npm start` y abre `http://localhost:4200` → inicia sesión con un usuario de la tabla `usuarios`.

El token JWT se guarda en `localStorage` y se envía en cada petición
(`core/auth/auth.interceptor.ts`). Si expira (401), la app vuelve al login.

| Vista            | Endpoints                                                                 |
|------------------|---------------------------------------------------------------------------|
| Login            | `POST /auth/login`                                                        |
| Dashboard        | `GET /arreglos`, `GET /clientes`, `GET /reportes/resumen`                 |
| Arreglos         | `GET/POST/PUT/DELETE /arreglos`, `GET /clientes?buscar=`, `GET/POST /pagos` |
| Clientes         | `GET/POST/PUT /clientes`                                                  |
| Detalle cliente  | `GET /clientes/:id`, `GET /pagos?id_arreglo=`, `POST /pagos`, `PUT /arreglos/:id`, `POST /arreglos/:id/notificar` |
| Agenda           | `GET /arreglos` (recordatorios en `localStorage`, el backend no los tiene aún) |
| Informes         | `GET /reportes/{resumen,ingresos,arreglos,clientes}`, `GET /reportes/{excel,pdf}` |
| Catálogos        | `GET /estados`, `GET /tipos-pago`                                         |

---


This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.8.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
