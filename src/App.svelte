<script lang="ts">
  import { onMount } from 'svelte';
  import './app.css';
  import SettingsModal from './lib/SettingsModal.svelte';
  import AuthForm from './lib/AuthForm.svelte';
  import WelcomeScreen from './lib/WelcomeScreen.svelte';

  type ViewState = 'checking' | 'unavailable' | 'login' | 'welcome';
  
  let view: ViewState = 'checking';
  let errorMessage = '';
  let showSettings = false;
  let currentUser: any = null;

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
          currentUser = session.user;
          view = 'welcome';
          return;
        }
      }

      view = 'login';
    } catch (error) {
      view = 'unavailable';
      errorMessage = 'Критическая ошибка IPC';
    }
  };

  onMount(() => {
    checkHealth(true);
  });

  const handleSaveSettings = async (baseUrl: string) => {
    await window.electronAPI.setServerConfig(baseUrl);
    showSettings = false;
    await checkHealth(true);
  };

  // ИСПРАВЛЕНИЕ ЗДЕСЬ: извлекаем данные из event.detail
  const handleAuthSuccess = (event: CustomEvent) => {
    currentUser = event.detail;
    view = 'welcome';
  };

  const handleLogout = () => {
    currentUser = null;
    view = 'login';
  };
</script>

<main>
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
    <AuthForm on:success={handleAuthSuccess} />
  {:else if view === 'welcome'}
    <WelcomeScreen user={currentUser} on:logout={handleLogout} />
  {/if}
</main>

{#if showSettings}
  <SettingsModal on:save={handleSaveSettings} on:cancel={() => showSettings = false} />
{/if}