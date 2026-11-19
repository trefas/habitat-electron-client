<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { api } from './api';
  import type { User } from './types';

  const dispatch = createEventDispatcher();

  export let user: User;

  let profile: User = user;
  let isLoading = true;
  let loadError = '';

  const loadProfile = async () => {
    isLoading = true;
    loadError = '';

    try {
      profile = await api.get('/api/v1/me');
      dispatch('userUpdated', profile);
    } catch (error: any) {
      loadError = error.message || 'Не удалось загрузить данные профиля';
    } finally {
      isLoading = false;
    }
  };

  const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString('ru-RU') : '—';

  const roleLabel = (role?: string) =>
    role === 'admin' ? 'Администратор' : 'Пользователь';

  const statusLabel = (status?: string) => {
    switch (status) {
      case 'active':
        return 'Активен';
      case 'pending':
        return 'Ожидает активации';
      case 'blocked':
        return 'Заблокирован';
      default:
        return status || '—';
    }
  };

  const statusClass = (status?: string) =>
    status === 'active' ? 'badge-active' : status === 'blocked' ? 'badge-blocked' : 'badge-pending';

  onMount(loadProfile);
</script>

<div class="page-container">
  <header class="page-header">
    <div>
      <h1>Добро пожаловать, {profile.display_name || profile.email}!</h1>
      <p class="page-subtitle">Вы успешно вошли в Habitat Client.</p>
    </div>
    <div class="page-actions">
      <button class="secondary" on:click={() => dispatch('messages')}>Сообщения</button>
      <button class="secondary" on:click={() => dispatch('profile')}>Профиль</button>
      <button class="logout-btn" on:click={() => dispatch('logout')}>Выйти</button>
    </div>
  </header>

  <section class="card">
    <div class="card-header">
      <h2>Учётная запись</h2>
      <button class="secondary small-btn" on:click={loadProfile} disabled={isLoading}>
        {isLoading ? 'Обновление...' : 'Обновить'}
      </button>
    </div>

    {#if loadError}
      <p class="error-text">{loadError}</p>
    {/if}

    <dl class="details-grid">
      <div>
        <dt>Email</dt>
        <dd>{profile.email}</dd>
      </div>
      <div>
        <dt>Имя</dt>
        <dd>{profile.display_name || '—'}</dd>
      </div>
      <div>
        <dt>Роль</dt>
        <dd>{roleLabel(profile.role)}</dd>
      </div>
      <div>
        <dt>Статус</dt>
        <dd><span class="badge {statusClass(profile.status)}">{statusLabel(profile.status)}</span></dd>
      </div>
      <div>
        <dt>Дата регистрации</dt>
        <dd>{formatDate(profile.created_at)}</dd>
      </div>
      <div>
        <dt>Последний вход</dt>
        <dd>{formatDate(profile.last_login_at)}</dd>
      </div>
    </dl>
  </section>
</div>
