<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  const dispatch = createEventDispatcher();
  export let user: any;
  let isLoading = false;

  const handleLogout = async () => {
    isLoading = true;
    await window.electronAPI.logout();
    dispatch('logout');
    isLoading = false;
  };

  onMount(() => {
    window.electronAPI.onForcedLogout(() => {
      alert('Сессия была завершена на сервере. Пожалуйста, войдите снова.');
      handleLogout();
    });
  });
</script>

<div class="welcome-container">
  <h1>Добро пожаловать, {user?.display_name || user?.email}!</h1>
  <p>Вы успешно авторизовались в системе Habitat.</p>
  
  <button class="logout-btn" on:click={handleLogout} disabled={isLoading}>
    {isLoading ? 'Выход...' : 'Выйти'}
  </button>
</div>