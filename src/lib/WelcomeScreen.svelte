<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { api } from '../lib/api';

  const dispatch = createEventDispatcher();
  export let user: any;
  
  let isLoading = false;
  let isFetchingProfile = true;
  let profileData: any = null;
  let fetchError = '';

  const fetchProfile = async () => {
    isFetchingProfile = true;
    fetchError = '';
    try {
      // Этот запрос автоматически получит заголовок Authorization из Main процесса
      // Если токен протух, Main процесс сам выполнит refresh и повторит запрос
      const data = await api.get('/api/v1/me');
      profileData = data;
    } catch (error: any) {
      console.error('Failed to fetch profile:', error);
      fetchError = error.message || 'Не удалось загрузить данные профиля';
    } finally {
      isFetchingProfile = false;
    }
  };

  const handleLogout = async () => {
    isLoading = true;
    await window.electronAPI.logout();
    dispatch('logout');
    isLoading = false;
  };

  onMount(() => {
    // Подписываемся на принудительный выход (Reuse Detection)
    const unsubscribe = window.electronAPI.onForcedLogout(() => {
      alert('Сессия была завершена на сервере (обнаружено повторное использование токена или отзыв).');
      handleLogout();
    });

    fetchProfile();

    return () => {
      unsubscribe();
    };
  });
</script>

<div class="welcome-container">
  <h1>Добро пожаловать, {user?.display_name || user?.email}!</h1>
  <p>Вы успешно авторизовались в системе Habitat.</p>
  
  <div class="profile-section">
    <h3>Данные профиля (защищенный эндпоинт /api/v1/me)</h3>
    {#if isFetchingProfile}
      <p class="loading-text">Загрузка данных...</p>
    {:else if fetchError}
      <p class="error-text">{fetchError}</p>
      <button class="secondary-btn" on:click={fetchProfile}>Повторить</button>
    {:else if profileData}
      <pre class="json-display">{JSON.stringify(profileData, null, 2)}</pre>
    {/if}
  </div>

  <button class="logout-btn" on:click={handleLogout} disabled={isLoading}>
    {isLoading ? 'Выход...' : 'Выйти'}
  </button>
</div>