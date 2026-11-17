<script lang="ts">
  import { onMount } from 'svelte';
  import './app.css';
  import SettingsModal from './lib/SettingsModal.svelte';

  let serverStatus: 'checking' | 'available' | 'unavailable' = 'checking';
  let errorMessage = '';
  let showSettings = false;

  const checkHealth = async () => {
    console.log('[Renderer] Функция checkHealth вызвана');
    serverStatus = 'checking';
    
    if (!window.electronAPI) {
      console.error('[Renderer] ОШИБКА: window.electronAPI НЕ НАЙДЕН!');
      errorMessage = 'Ошибка инициализации Electron API';
      serverStatus = 'unavailable';
      return;
    }

    console.log('[Renderer] Отправляю IPC-запрос на проверку здоровья...');
    
    try {
      const result = await window.electronAPI.checkServerHealth();
      console.log('[Renderer] Получен ответ от Main процесса:', result);

      if (result.success) {
        serverStatus = 'available';
      } else {
        serverStatus = 'unavailable';
        errorMessage = result.error || 'Неизвестная ошибка';
      }
    } catch (error) {
      console.error('[Renderer] Исключение при вызове checkServerHealth:', error);
      serverStatus = 'unavailable';
      errorMessage = 'Критическая ошибка IPC';
    }
  };

  onMount(() => {
    console.log('[Renderer] App.svelte смонтирован, вызываю checkHealth');
    checkHealth();
  });

  const handleSaveSettings = async (baseUrl: string) => {
    await window.electronAPI.setServerConfig(baseUrl);
    showSettings = false;
    await checkHealth();
  };
</script>

<main>
  {#if serverStatus === 'checking'}
    <h1>Проверка подключения к серверу...</h1>
    <p>Пожалуйста, подождите.</p>
  {:else if serverStatus === 'available'}
    <h1 style="color: var(--ctp-green)">Сервер доступен</h1>
    <p>Переход к форме авторизации...</p>
    <p style="color: var(--ctp-surface2); font-size: 0.9rem;">(Будет реализовано на следующем шаге)</p>
  {:else}
    <h1 style="color: var(--ctp-red)">Сервер недоступен</h1>
    <p>Ошибка: {errorMessage}</p>
    <div class="buttons">
      <button on:click={checkHealth}>Обновить</button>
      <button class="secondary" on:click={() => showSettings = true}>Настроить</button>
    </div>
  {/if}
</main>

{#if showSettings}
  <SettingsModal on:save={handleSaveSettings} on:cancel={() => showSettings = false} />
{/if}