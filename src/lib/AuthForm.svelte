<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let notice = '';

  let isLogin = true;
  let email = '';
  let password = '';
  let displayName = '';
  let isLoading = false;
  let errorMessage = '';

  const handleSubmit = async () => {
    isLoading = true;
    errorMessage = '';

    try {
      if (isLogin) {
        const result = await window.electronAPI.login({ email, password });
        if (result?.success && result.user) {
          dispatch('success', result.user);
        } else {
          errorMessage = result?.error || 'Неверный email или пароль';
        }
      } else {
        const result = await window.electronAPI.register({ email, password, display_name: displayName });
        if (result?.success) {
          isLogin = true;
          errorMessage = 'Регистрация успешна. Теперь вы можете войти.';
          password = '';
          displayName = '';
        } else {
          errorMessage = result?.error || 'Ошибка регистрации';
        }
      }
    } catch (error) {
      errorMessage = 'Произошла непредвиденная ошибка';
    } finally {
      isLoading = false;
    }
  };
</script>

<div class="auth-container">
  <h2>{isLogin ? 'Вход в систему' : 'Регистрация'}</h2>
  
  {#if notice}
    <p class="info-message">{notice}</p>
  {/if}

  {#if errorMessage}
    <p class="error-message">{errorMessage}</p>
  {/if}

  <form on:submit|preventDefault={handleSubmit}>
    {#if !isLogin}
      <div class="form-group">
        <label for="displayName">Имя</label>
        <input id="displayName" type="text" bind:value={displayName} required />
      </div>
    {/if}

    <div class="form-group">
      <label for="email">Email</label>
      <input id="email" type="email" bind:value={email} required />
    </div>

    <div class="form-group">
      <label for="password">Пароль</label>
      <input
        id="password"
        type="password"
        bind:value={password}
        required
        minlength="8"
        maxlength="72"
        autocomplete={isLogin ? 'current-password' : 'new-password'}
      />
    </div>

    <button type="submit" class="primary-btn" disabled={isLoading}>
      {isLoading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}
    </button>
  </form>

  <p class="toggle-text">
    {isLogin ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
    <button class="text-btn" on:click={() => { isLogin = !isLogin; errorMessage = ''; }}>
      {isLogin ? 'Зарегистрироваться' : 'Войти'}
    </button>
  </p>
</div>