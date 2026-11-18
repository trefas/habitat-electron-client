<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { api } from './api';
  import type { User } from './types';

  const dispatch = createEventDispatcher();

  export let user: User;

  let profile: User = user;
  let isLoadingProfile = true;
  let profileError = '';

  let displayName = user.display_name || '';
  let isSavingName = false;
  let nameError = '';
  let nameNotice = '';

  let currentPassword = '';
  let newPassword = '';
  let confirmPassword = '';
  let isSavingPassword = false;
  let passwordError = '';

  const messageOf = (error: any) =>
    error?.message || 'Не удалось выполнить запрос';

  const loadProfile = async () => {
    isLoadingProfile = true;
    profileError = '';

    try {
      const data: User = await api.get('/api/v1/me');
      profile = data;
      displayName = data.display_name || '';
      dispatch('userUpdated', data);
    } catch (error: any) {
      profileError = messageOf(error);
    } finally {
      isLoadingProfile = false;
    }
  };

  const saveDisplayName = async () => {
    nameError = '';
    nameNotice = '';

    const nextName = displayName.trim();
    if (!nextName) {
      nameError = 'Имя не может быть пустым';
      return;
    }

    isSavingName = true;

    try {
      const updated: User = await api.patch('/api/v1/me', {
        display_name: nextName,
      });
      profile = updated;
      displayName = updated.display_name || '';
      dispatch('userUpdated', updated);
      nameNotice = 'Имя сохранено.';
    } catch (error: any) {
      nameError = messageOf(error);
    } finally {
      isSavingName = false;
    }
  };

  const changePassword = async () => {
    passwordError = '';

    if (!currentPassword) {
      passwordError = 'Введите текущий пароль';
      return;
    }
    if (newPassword.length < 8) {
      passwordError = 'Новый пароль должен содержать минимум 8 символов';
      return;
    }
    if (newPassword.length > 72) {
      passwordError = 'Новый пароль не должен превышать 72 символа';
      return;
    }
    if (newPassword !== confirmPassword) {
      passwordError = 'Пароли не совпадают';
      return;
    }
    if (newPassword === currentPassword) {
      passwordError = 'Новый пароль должен отличаться от текущего';
      return;
    }

    isSavingPassword = true;

    try {
      await api.patch('/api/v1/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      });

      currentPassword = '';
      newPassword = '';
      confirmPassword = '';

      // Сервер уже отозвал все сессии — выходим локально.
      dispatch('logout', {
        notice: 'Пароль изменён. Войдите снова с новым паролем.',
      });
    } catch (error: any) {
      passwordError = messageOf(error);
    } finally {
      isSavingPassword = false;
    }
  };

  onMount(loadProfile);
</script>

<div class="page-container narrow">
  <header class="page-header">
    <div>
      <h1>Профиль</h1>
      <p class="page-subtitle">Личные данные и безопасность учётной записи.</p>
    </div>
    <div class="page-actions">
      <button class="secondary" on:click={() => dispatch('back')}>Назад</button>
      <button class="logout-btn" on:click={() => dispatch('logout')}>Выйти</button>
    </div>
  </header>

  {#if profileError}
    <p class="error-message">{profileError}</p>
  {/if}

  <section class="card section-card">
    <div class="card-header">
      <h2>Личные данные</h2>
      {#if isLoadingProfile}
        <span class="loading-text">Загрузка...</span>
      {/if}
    </div>

    <div class="form-group">
      <label for="profile-email">Email</label>
      <input id="profile-email" type="email" value={profile.email} disabled />
      <p class="hint">Email изменить нельзя.</p>
    </div>

    <form on:submit|preventDefault={saveDisplayName}>
      <div class="form-group">
        <label for="profile-display-name">Имя</label>
        <input
          id="profile-display-name"
          type="text"
          maxlength="100"
          bind:value={displayName}
          required
        />
      </div>

      {#if nameError}
        <p class="error-message">{nameError}</p>
      {/if}
      {#if nameNotice}
        <p class="success-message">{nameNotice}</p>
      {/if}

      <button type="submit" disabled={isSavingName}>
        {isSavingName ? 'Сохранение...' : 'Сохранить имя'}
      </button>
    </form>
  </section>

  <section class="card section-card">
    <h2>Смена пароля</h2>
    <p class="hint">
      После смены пароля все активные сессии будут завершены, поэтому потребуется войти заново.
    </p>

    <form on:submit|preventDefault={changePassword}>
      <div class="form-group">
        <label for="current-password">Текущий пароль</label>
        <input
          id="current-password"
          type="password"
          autocomplete="current-password"
          bind:value={currentPassword}
          required
        />
      </div>

      <div class="form-group">
        <label for="new-password">Новый пароль</label>
        <input
          id="new-password"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="72"
          bind:value={newPassword}
          required
        />
      </div>

      <div class="form-group">
        <label for="confirm-password">Повторите новый пароль</label>
        <input
          id="confirm-password"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="72"
          bind:value={confirmPassword}
          required
        />
      </div>

      {#if passwordError}
        <p class="error-message">{passwordError}</p>
      {/if}

      <button type="submit" disabled={isSavingPassword}>
        {isSavingPassword ? 'Смена пароля...' : 'Сменить пароль'}
      </button>
    </form>
  </section>
</div>
