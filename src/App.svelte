<script lang="ts">
  import { onMount } from 'svelte';
  import './app.css';
  import SettingsModal from './lib/SettingsModal.svelte';
  import AuthForm from './lib/AuthForm.svelte';
  import WelcomeScreen from './lib/WelcomeScreen.svelte';
  import AdminPanel from './lib/AdminPanel.svelte';
  import ProfilePage from './lib/ProfilePage.svelte';
  import type { User } from './lib/types';

  type MainView = 'welcome' | 'admin' | 'profile';
  type ViewState = 'checking' | 'unavailable' | 'login' | MainView;

  let view: ViewState = 'checking';
  let errorMessage = '';
  let showSettings = false;
  let currentUser: User | null = null;
  let loginNotice = '';
  let previousView: 'welcome' | 'admin' = 'welcome';

  const isCentered = () => view === 'checking' || view === 'unavailable' || view === 'login';

  const openSession = (user: User) => {
    currentUser = user;
    loginNotice = '';
    view = user.role === 'admin' ? 'admin' : 'welcome';
  };

  const checkHealth = async (restoreSession = false) => {
    view = 'checking';
    if (!window.electronAPI) {
      errorMessage = 'Ошибка инициализации Electron API';
      view = 'unavailable';
      return;
    }
    try {
      const result = await window.electronAPI.checkServerHealth();
      if (!result.success) {
        view = 'unavailable';
        errorMessage = result.error || 'Неизвестная ошибка';
        return;
      }

      if (restoreSession) {
        const session = await window.electronAPI.restoreSession();
        if (session?.success && session.user) {
          openSession(session.user);
          return;
        }
      }

      currentUser = null;
      view = 'login';
    } catch (error) {
      view = 'unavailable';
      errorMessage = 'Критическая ошибка IPC';
    }
  };

  onMount(() => {
    checkHealth(true);

    // Централизованно реагируем на отзыв сессии сервером.
    const unsubscribe = window.electronAPI.onForcedLogout(() => {
      currentUser = null;
      loginNotice = 'Сессия была завершена на сервере. Войдите снова.';
      view = 'login';
    });

    return unsubscribe;
  });

  const handleSaveSettings = async (baseUrl: string) => {
    await window.electronAPI.setServerConfig(baseUrl);
    showSettings = false;
    await checkHealth(true);
  };

  const handleAuthSuccess = (event: CustomEvent<User>) => {
    openSession(event.detail);
  };

  const handleLogout = async (event?: CustomEvent<{ notice?: string }>) => {
    const notice = event?.detail?.notice || '';
    try {
      await window.electronAPI.logout();
    } catch (error) {
      // Локальные токены всё равно нужно очистить.
    }
    currentUser = null;
    loginNotice = notice;
    view = 'login';
  };

  const handleOpenProfile = () => {
    previousView = view === 'admin' ? 'admin' : 'welcome';
    view = 'profile';
  };

  const handleProfileBack = () => {
    view = previousView;
  };

  const handleUserUpdated = (event: CustomEvent<User>) => {
    currentUser = event.detail;
  };
</script>

<main class:centered={isCentered()}>
  {#if view === 'checking'}
    <h1>Проверка подключения к серверу...</h1>
    <p>Пожалуйста, подождите.</p>
  {:else if view === 'unavailable'}
    <h1 style="color: var(--ctp-red)">Сервер недоступен</h1>
    <p>Ошибка: {errorMessage}</p>
    <div class="buttons">
      <button on:click={() => checkHealth(true)}>Обновить</button>
      <button class="secondary" on:click={() => showSettings = true}>Настроить</button>
    </div>
  {:else if view === 'login'}
    <AuthForm notice={loginNotice} on:success={handleAuthSuccess} />
  {:else if view === 'welcome' && currentUser}
    <WelcomeScreen
      user={currentUser}
      on:logout={handleLogout}
      on:profile={handleOpenProfile}
      on:userUpdated={handleUserUpdated}
    />
  {:else if view === 'admin' && currentUser}
    <AdminPanel
      user={currentUser}
      on:logout={handleLogout}
      on:profile={handleOpenProfile}
      on:userUpdated={handleUserUpdated}
    />
  {:else if view === 'profile' && currentUser}
    <ProfilePage
      user={currentUser}
      on:back={handleProfileBack}
      on:logout={handleLogout}
      on:userUpdated={handleUserUpdated}
    />
  {/if}
</main>

{#if showSettings}
  <SettingsModal on:save={handleSaveSettings} on:cancel={() => showSettings = false} />
{/if}
