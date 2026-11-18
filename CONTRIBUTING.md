# Участие в разработке

Спасибо за интерес к проекту! Здесь описано, как собрать приложение, устроен код
и как подготовить изменения.

## Стек

- **Electron** — настольная оболочка.
- **Svelte 5 + TypeScript** — интерфейс (renderer).
- **Vite** — сборка renderer-процесса и main/preload через `vite-plugin-electron`.
- **electron-builder** — сборка AppImage, `.deb` и `.rpm`.
- **electron-store** и Electron `safeStorage` — настройки и защищённое хранение
  refresh-токена.

Серверная часть (Go) находится в отдельном репозитории Habitat и должна быть
запущена для полноценной проверки входа и API.

## Требования

- Node.js >= 22.12.0 (см. `engines` в `package.json`).
- npm.
- Linux для сборки Linux-пакетов.
- Для `.rpm` в CI устанавливается пакет `rpm`; для локальной сборки всех
  форматов также нужны `dpkg`/`rpm` и `fakeroot`.

## Быстрый старт

```bash
npm install
npm run dev
```

`npm run dev` запускает Vite и Electron с горячей перезагрузкой renderer-кода.
Для входа нужен запущенный сервер Habitat; адрес по умолчанию —
`http://localhost:8080`, изменить его можно на экране «Сервер недоступен» →
**Настроить**.

### Полезные команды

```bash
npm run dev              # разработка (Vite + Electron)
npm run build            # production-сборка dist/ и dist-electron/
npm run electron:build   # сборка без установщиков (--dir)
npm run electron:dist    # собрать пакеты для текущей платформы
npm run electron:dist:linux # AppImage + deb + rpm
```

## Структура проекта

```
electron/
  main.ts        # главный процесс: окно, IPC, авторизация, HTTP-запросы,
                 # хранение refresh-токена, интеграция AppImage с рабочим столом
  preload.ts     # безопасный мост window.electronAPI
src/
  App.svelte     # маршрутизация экранов, восстановление сессии, forced logout
  app.css        # общие стили (палитра Catppuccin, тёмная тема)
  lib/
    api.ts             # обёртка над IPC-запросами (get/post/put/patch/delete)
    types.ts           # общие типы User, UserListResponse
    AuthForm.svelte    # вход и регистрация
    WelcomeScreen.svelte
    ProfilePage.svelte
    AdminPanel.svelte
    SettingsModal.svelte
```

## Архитектура

- Renderer не обращается к сети напрямую и не имеет доступа к Node.js
  (`contextIsolation: true`, `nodeIntegration: false`).
- Все запросы идут через `window.electronAPI.makeAuthenticatedRequest` в главный
  процесс. Там к запросу добавляется access-токен, при истечении выполняется
  refresh, а при отзыве сессии renderer получает событие `onForcedLogout`.
- Access-токен хранится только в памяти главного процесса. Refresh-токен —
  в зашифрованном файле (`safeStorage`, режим `0600`); если шифрование
  недоступно, токен живёт только в памяти.
- После смены пароля сервер отзывает все refresh-токены, поэтому клиент
  централизованно в `App.svelte` реагирует на forced logout и показывает экран
  входа с пояснением.

## Используемые endpoint'ы сервера

| Метод | Путь | Назначение |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | регистрация |
| `POST` | `/api/v1/auth/login` | вход |
| `POST` | `/api/v1/auth/refresh` | обновление access-токена |
| `POST` | `/api/v1/auth/logout` | выход |
| `GET` | `/api/v1/me` | текущий пользователь |
| `PATCH` | `/api/v1/me` | смена собственного имени (`display_name`) |
| `PATCH` | `/api/v1/me/password` | смена собственного пароля |
| `GET` | `/api/v1/admin/users` | список пользователей (поиск, фильтры, пагинация) |
| `PATCH` | `/api/v1/admin/users/{id}` | изменение пользователя администратором |
| `DELETE` | `/api/v1/admin/users/{id}` | удаление пользователя администратором |

При добавлении полей в профиль учитывайте, что `PATCH /api/v1/me` намеренно
принимает только `display_name`; email, роль и статус меняет только
администратор.

## Стиль кода

- Пользовательский интерфейс и сообщения — на русском языке.
- TypeScript: избегайте `any` в новом коде, типы пользователя — в `src/lib/types.ts`.
- Стили — в `src/app.css` с переменными Catppuccin (`--ctp-*`), без
  inline-цветов. Поддерживаются светлая и тёмная темы.
- Svelte 5: используются `createEventDispatcher`, `bind:value`, `onMount` и
  реактивные выражения; не добавляйте устаревшие конструкции без необходимости.
- Ошибки API показывайте через существующие `error-message` / `success-message`.

## Проверка перед pull request

1. `npm ci && npm run build` — сборка проходит без ошибок.
2. Вручную проверьте затронутые сценарии:
   - вход обычного пользователя → приветственный экран;
   - вход администратора → админ-панель;
   - переход в профиль и обратно;
   - смена имени и пароля (после смены пароля — принудительный выход и вход
     с новым паролем);
   - поиск, фильтры, пагинация, редактирование и удаление в админ-панели;
   - восстановление сессии после перезапуска приложения.
3. Убедитесь, что существующие endpoint'ы и форматы ответов не менялись
   несовместимым образом.

## CI и релизы

- `.github/workflows/ci.yml` собирает приложение и пакеты для push в `main` /
  `develop` и для pull request'ов.
- `.github/workflows/cd.yml` публикует релиз по тегу `v*`.
- Тег должен совпадать с версией в `package.json`: для версии `1.2.3` — тег
  `v1.2.3`, иначе CD остановится.

Порядок выпуска:

```bash
npm version patch   # или minor/major — обновит package.json и создаст коммит/тег
git push --follow-tags
```

После этого GitHub Actions соберёт AppImage, `.deb` и `.rpm` и приложит их
к релизу.

---

# Исходная документация шаблона Svelte + TS + Vite

This template should help get you started developing with Svelte and TypeScript
in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode).

## Need an official Svelte framework?

Check out [SvelteKit](https://github.com/sveltejs/kit#readme), which is also
powered by Vite. Deploy anywhere with its serverless-first approach and adapt to
various platforms, with out of the box support for TypeScript, SCSS, and Less,
and easily-added support for mdsvex, GraphQL, PostCSS, Tailwind CSS, and more.

## Technical considerations

**Why use this over SvelteKit?**

- It brings its own routing solution which might not be preferable for some users.
- It is first and foremost a framework that just happens to use Vite under the
  hood, not a Vite app.

This template contains as little as possible to get started with Vite +
TypeScript + Svelte, while taking into account the developer experience with
regards to HMR and intellisense. It demonstrates capabilities on par with the
other `create-vite` templates and is a good starting point for beginners dipping
their toes into a Vite + Svelte project.

Should you later need the extended capabilities and extensibility provided by
SvelteKit, the template has been structured similarly to SvelteKit so that it is
easy to migrate.

**Почему декларации Electron вынесены в `src/electron.d.ts`?**

Отдельный файл деклараций описывает контракт `window.electronAPI`, который
предоставляет preload-скрипт. Благодаря этому renderer видит типы IPC-методов
без импорта кода главного процесса. Не добавляйте `electron` в
`compilerOptions.types`: это отключило бы остальные глобальные типы, которые
TypeScript подхватывает из рабочей области.

**Why include `.vscode/extensions.json`?**

Other templates indirectly recommend extensions via the README, but this file
allows VS Code to prompt the user to install the recommended extension upon
opening the project.

**Why enable `allowJs` in the TS template?**

While `allowJs: false` would indeed prevent the use of `.js` files in the
project, it does not prevent the use of JavaScript syntax in `.svelte` files. In
addition, it would force `checkJs: false`, bringing the worst of both worlds: not
being able to guarantee the entire codebase is TypeScript, and also having worse
typechecking for the existing JavaScript. In addition, there are valid use cases
in which a mixed codebase may be relevant.

**Why is HMR not preserving my local component state?**

HMR state preservation comes with a number of gotchas! It has been disabled by
default in both `svelte-hmr` and `@sveltejs/vite-plugin-svelte` due to its often
surprising behavior. You can read the details
[here](https://github.com/rixo/svelte-hmr#svelte-hmr).

If you have state that's important to retain within a component, consider
creating an external store which would not be replaced by HMR.

```ts
// store.ts
// An extremely simple external store
import { writable } from 'svelte/store'
export default writable(0)
```
