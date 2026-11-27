<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { api } from './api';
  import type { User, UserListResponse } from './types';

  const dispatch = createEventDispatcher();

  export let user: User;

  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

  let items: User[] = [];
  let total = 0;
  let limit = 20;
  let offset = 0;

  let search = '';
  let roleFilter = '';
  let statusFilter = '';

  let isLoading = false;
  let pageError = '';
  let notice = '';

  let editingUser: User | null = null;
  let editDisplayName = '';
  let editRole = 'user';
  let editStatus = 'active';
  let isSaving = false;
  let editError = '';

  const messageOf = (error: any) =>
    error?.message || 'Не удалось выполнить запрос';

  const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString('ru-RU') : '—';

  const roleLabel = (role?: string) =>
    role === 'admin' ? 'Администратор' : 'Пользователь';

  const statusLabel = (status?: string) => {
    switch (status) {
      case 'active':
        return 'Активен';
      case 'pending':
        return 'Ожидает';
      case 'blocked':
        return 'Заблокирован';
      default:
        return status || '—';
    }
  };

  const statusClass = (status?: string) =>
    status === 'active' ? 'badge-active' : status === 'blocked' ? 'badge-blocked' : 'badge-pending';

  const pageNumber = () => Math.floor(offset / limit) + 1;
  const totalPages = () => Math.max(1, Math.ceil(total / limit));

  const loadUsers = async () => {
    isLoading = true;
    pageError = '';
    notice = '';

    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (roleFilter) params.set('role', roleFilter);
    if (statusFilter) params.set('status', statusFilter);
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    try {
      const data: UserListResponse = await api.get(`/api/v1/admin/users?${params.toString()}`);
      items = data.items || [];
      total = data.total || 0;
    } catch (error: any) {
      pageError = messageOf(error);
    } finally {
      isLoading = false;
    }
  };

  const applyFilters = () => {
    offset = 0;
    loadUsers();
  };

  const goToPreviousPage = () => {
    if (offset === 0) return;
    offset = Math.max(0, offset - limit);
    loadUsers();
  };

  const goToNextPage = () => {
    if (offset + limit >= total) return;
    offset += limit;
    loadUsers();
  };

  const changePageSize = () => {
    offset = 0;
    loadUsers();
  };

  const openEdit = (target: User) => {
    editingUser = target;
    editDisplayName = target.display_name || '';
    editRole = target.role;
    editStatus = target.status || 'active';
    editError = '';
  };

  const closeEdit = () => {
    if (isSaving) return;
    editingUser = null;
    editError = '';
  };

  const saveEdit = async () => {
    if (!editingUser) return;

    isSaving = true;
    editError = '';

    const isSelf = editingUser.id === user.id;
    const patch: Record<string, string> = {
      display_name: editDisplayName.trim(),
    };

    // Сервер запрещает менять собственную роль и статус.
    if (!isSelf) {
      patch.role = editRole;
      patch.status = editStatus;
    }

    try {
      const updated: User = await api.patch(`/api/v1/admin/users/${editingUser.id}`, patch);
      if (updated.id === user.id) {
        dispatch('userUpdated', updated);
      }
      editingUser = null;
      await loadUsers();
      notice = 'Изменения сохранены.';
    } catch (error: any) {
      editError = messageOf(error);
    } finally {
      isSaving = false;
    }
  };

  const deleteUser = async (target: User) => {
    if (target.id === user.id) return;

    const confirmed = window.confirm(
      `Удалить пользователя ${target.display_name || target.email}? Это действие необратимо.`,
    );
    if (!confirmed) return;

    pageError = '';
    notice = '';

    try {
      await api.delete(`/api/v1/admin/users/${target.id}`);
      notice = 'Пользователь удалён.';

      if (items.length === 1 && offset > 0) {
        offset = Math.max(0, offset - limit);
      }

      await loadUsers();
      notice = 'Пользователь удалён.';
    } catch (error: any) {
      pageError = messageOf(error);
    }
  };

  onMount(loadUsers);
</script>

<div class="page-container">
  <header class="page-header">
    <div>
      <h1>Администрирование</h1>
      <p class="page-subtitle">
        Вы вошли как {user.display_name || user.email} · {roleLabel(user.role)}
      </p>
    </div>
    <div class="page-actions">
      <button class="secondary" on:click={() => dispatch('messages')}>Сообщения</button>
      <button class="secondary" on:click={() => dispatch('lists')}>Списки</button>
      <button class="secondary" on:click={() => dispatch('profile')}>Профиль</button>
      <button class="logout-btn" on:click={() => dispatch('logout')}>Выйти</button>
    </div>
  </header>

  <section class="card">
    <form class="toolbar" on:submit|preventDefault={applyFilters}>
      <div class="form-group">
        <label for="user-search">Поиск</label>
        <input
          id="user-search"
          type="search"
          placeholder="Email или имя"
          maxlength="100"
          bind:value={search}
        />
      </div>

      <div class="form-group">
        <label for="role-filter">Роль</label>
        <select id="role-filter" bind:value={roleFilter}>
          <option value="">Все</option>
          <option value="user">Пользователь</option>
          <option value="admin">Администратор</option>
        </select>
      </div>

      <div class="form-group">
        <label for="status-filter">Статус</label>
        <select id="status-filter" bind:value={statusFilter}>
          <option value="">Все</option>
          <option value="active">Активен</option>
          <option value="pending">Ожидает</option>
          <option value="blocked">Заблокирован</option>
        </select>
      </div>

      <div class="form-group">
        <label for="limit-filter">На странице</label>
        <select id="limit-filter" bind:value={limit} on:change={changePageSize}>
          {#each PAGE_SIZE_OPTIONS as size}
            <option value={size}>{size}</option>
          {/each}
        </select>
      </div>

      <button type="submit" disabled={isLoading}>Найти</button>
    </form>

    {#if pageError}
      <p class="error-message">{pageError}</p>
    {/if}

    {#if notice}
      <p class="success-message">{notice}</p>
    {/if}

    {#if isLoading}
      <p class="loading-text">Загрузка пользователей...</p>
    {:else if items.length === 0}
      <p class="empty-state">Пользователи не найдены.</p>
    {:else}
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Email</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Последний вход</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each items as item (item.id)}
              <tr>
                <td>
                  {item.display_name || '—'}
                  {#if item.id === user.id}
                    <span class="self-mark">это вы</span>
                  {/if}
                </td>
                <td>{item.email}</td>
                <td>{roleLabel(item.role)}</td>
                <td>
                  <span class="badge {statusClass(item.status)}">{statusLabel(item.status)}</span>
                </td>
                <td>{formatDate(item.last_login_at)}</td>
                <td>
                  <div class="row-actions">
                    <button class="secondary small-btn" on:click={() => openEdit(item)}>
                      Изменить
                    </button>
                    <button
                      class="danger-btn small-btn"
                      on:click={() => deleteUser(item)}
                      disabled={item.id === user.id}
                      title={item.id === user.id ? 'Нельзя удалить собственную учётную запись' : 'Удалить'}
                    >
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <span>Всего: {total}</span>
        <button class="secondary small-btn" on:click={goToPreviousPage} disabled={offset === 0}>
          Назад
        </button>
        <span>Страница {pageNumber()} из {totalPages()}</span>
        <button
          class="secondary small-btn"
          on:click={goToNextPage}
          disabled={offset + limit >= total}
        >
          Вперёд
        </button>
      </div>
    {/if}
  </section>
</div>

{#if editingUser}
  <div
    class="modal-overlay"
    role="presentation"
    on:click|self={closeEdit}
  >
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
      <h2 id="edit-user-title">Изменить пользователя</h2>
      <p class="modal-subtitle">{editingUser.email}</p>

      <form on:submit|preventDefault={saveEdit}>
        <div class="form-group">
          <label for="edit-display-name">Имя</label>
          <input id="edit-display-name" type="text" maxlength="100" bind:value={editDisplayName} />
        </div>

        <div class="form-group">
          <label for="edit-role">Роль</label>
          <select
            id="edit-role"
            bind:value={editRole}
            disabled={editingUser.id === user.id}
          >
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
          </select>
        </div>

        <div class="form-group">
          <label for="edit-status">Статус</label>
          <select
            id="edit-status"
            bind:value={editStatus}
            disabled={editingUser.id === user.id}
          >
            <option value="active">Активен</option>
            <option value="pending">Ожидает</option>
            <option value="blocked">Заблокирован</option>
          </select>
        </div>

        {#if editingUser.id === user.id}
          <p class="hint">Собственную роль и статус изменить нельзя.</p>
        {/if}

        {#if editError}
          <p class="error-message">{editError}</p>
        {/if}

        <div class="buttons">
          <button type="submit" disabled={isSaving}>
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button type="button" class="secondary" on:click={closeEdit} disabled={isSaving}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
