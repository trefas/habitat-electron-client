<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { api } from './api';
  import type { HabitatList, ListItem, ListRecipient, ListResponse } from './types';

  export let initialListID: string | null = null;

  const dispatch = createEventDispatcher();

  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

  type DraftItem = { text: string; is_checked: boolean };

  let lists: HabitatList[] = [];
  let total = 0;
  let limit = 20;
  let offset = 0;
  let isLoading = false;
  let listsError = '';
  let notice = '';

  let createOpen = false;
  let createTitle = '';
  let createRecipients = '';
  let draftItems: DraftItem[] = [];
  let createError = '';
  let isCreating = false;

  let selected: HabitatList | null = null;
  let detailOpen = false;
  let detailError = '';
  let isLoadingDetail = false;

  let titleDraft = '';
  let isSavingTitle = false;

  let newItemText = '';
  let itemError = '';
  let isSavingItem = false;

  let shareRecipients = '';
  let shareError = '';
  let shareNotice = '';
  let isSharing = false;

  const messageOf = (error: any) => error?.message || 'Не удалось выполнить запрос';

  const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString('ru-RU') : '—';

  const parseRecipients = (raw: string): string[] =>
    Array.from(
      new Set(
        raw
          .split(/[\s,;]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );

  const accessLabel = (list: HabitatList) => {
    if (list.is_owner) return 'Владелец';
    if (list.permission === 'write') return 'Можно редактировать';
    return 'Только чтение';
  };

  const accessClass = (list: HabitatList) =>
    list.permission === 'read' && !list.is_owner ? 'badge-pending' : 'badge-active';

  const progress = (list: HabitatList) =>
    `${list.items_checked} из ${list.items_total} отмечено`;

  const pageNumber = () => Math.floor(offset / limit) + 1;
  const totalPages = () => Math.max(1, Math.ceil(total / limit));

  const loadLists = async () => {
    isLoading = true;
    listsError = '';
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    try {
      const data: ListResponse = await api.get(`/api/v1/lists?${params.toString()}`);
      lists = data.items || [];
      total = data.total || 0;
      if (lists.length === 0 && offset > 0) {
        offset = Math.max(0, offset - limit);
        await loadLists();
      }
    } catch (error: any) {
      listsError = messageOf(error);
    } finally {
      isLoading = false;
    }
  };

  const openListById = async (id: string) => {
    isLoadingDetail = true;
    detailError = '';
    itemError = '';
    shareError = '';
    shareNotice = '';
    shareRecipients = '';
    newItemText = '';
    try {
      const data: HabitatList = await api.get(`/api/v1/lists/${id}`);
      selected = data;
      titleDraft = data.title;
      detailOpen = true;
    } catch (error: any) {
      listsError = messageOf(error);
    } finally {
      isLoadingDetail = false;
    }
  };

  const openList = (list: HabitatList) => {
    void openListById(list.id);
  };

  const closeDetail = () => {
    if (isSharing || isSavingItem || isSavingTitle) return;
    detailOpen = false;
    selected = null;
    void loadLists();
  };

  const refresh = () => {
    notice = '';
    void loadLists();
  };

  const changePageSize = () => {
    offset = 0;
    void loadLists();
  };

  const goToPreviousPage = () => {
    if (offset === 0) return;
    offset = Math.max(0, offset - limit);
    void loadLists();
  };

  const goToNextPage = () => {
    if (offset + limit >= total) return;
    offset += limit;
    void loadLists();
  };

  const openCreate = () => {
    createTitle = '';
    createRecipients = '';
    draftItems = [{ text: '', is_checked: false }];
    createError = '';
    createOpen = true;
  };

  const closeCreate = () => {
    if (isCreating) return;
    createOpen = false;
  };

  const addDraftItem = () => {
    draftItems = [...draftItems, { text: '', is_checked: false }];
  };

  const removeDraftItem = (index: number) => {
    draftItems = draftItems.filter((_, i) => i !== index);
  };

  const createList = async () => {
    createError = '';

    const title = createTitle.trim();
    if (!title) {
      createError = 'Введите название списка';
      return;
    }
    if (title.length > 256) {
      createError = 'Название не должно превышать 256 символов';
      return;
    }

    const items = draftItems
      .map((item) => ({ text: item.text.trim(), is_checked: item.is_checked }))
      .filter((item) => item.text.length > 0);

    for (const item of items) {
      if (item.text.length > 500) {
        createError = 'Текст пункта не должен превышать 500 символов';
        return;
      }
    }

    const recipients = parseRecipients(createRecipients);

    isCreating = true;
    try {
      const created: HabitatList = await api.post('/api/v1/lists', {
        title,
        items,
        recipients,
      });
      createOpen = false;
      offset = 0;
      await loadLists();
      notice = 'Список создан.';
      await openListById(created.id);
    } catch (error: any) {
      createError = messageOf(error);
    } finally {
      isCreating = false;
    }
  };

  const saveTitle = async () => {
    if (!selected) return;
    const title = titleDraft.trim();
    if (!title) {
      itemError = 'Название не может быть пустым';
      return;
    }

    isSavingTitle = true;
    itemError = '';
    try {
      const data: HabitatList = await api.patch(`/api/v1/lists/${selected.id}`, { title });
      selected = data;
      titleDraft = data.title;
      notice = 'Название обновлено.';
      await loadLists();
    } catch (error: any) {
      itemError = messageOf(error);
    } finally {
      isSavingTitle = false;
    }
  };

  const toggleItem = async (item: ListItem) => {
    if (!selected) return;
    const next = !item.is_checked;
    item.is_checked = next;
    itemError = '';
    isSavingItem = true;
    try {
      const data: HabitatList = await api.patch(
        `/api/v1/lists/${selected.id}/items/${item.id}`,
        { is_checked: next },
      );
      selected = data;
      await loadLists();
    } catch (error: any) {
      item.is_checked = !next;
      itemError = messageOf(error);
    } finally {
      isSavingItem = false;
    }
  };

  const renameItem = async (item: ListItem) => {
    if (!selected) return;
    const raw = window.prompt('Новый текст пункта', item.text);
    if (raw === null) return;

    const text = raw.trim();
    if (!text) {
      itemError = 'Текст пункта не может быть пустым';
      return;
    }
    if (text.length > 500) {
      itemError = 'Текст пункта не должен превышать 500 символов';
      return;
    }

    itemError = '';
    isSavingItem = true;
    try {
      const data: HabitatList = await api.patch(
        `/api/v1/lists/${selected.id}/items/${item.id}`,
        { text },
      );
      selected = data;
      await loadLists();
    } catch (error: any) {
      itemError = messageOf(error);
    } finally {
      isSavingItem = false;
    }
  };

  const deleteItem = async (item: ListItem) => {
    if (!selected) return;
    if (!window.confirm(`Удалить пункт «${item.text}»?`)) return;

    itemError = '';
    isSavingItem = true;
    try {
      const data: HabitatList = await api.delete(
        `/api/v1/lists/${selected.id}/items/${item.id}`,
      );
      selected = data;
      await loadLists();
    } catch (error: any) {
      itemError = messageOf(error);
    } finally {
      isSavingItem = false;
    }
  };

  const addItem = async () => {
    if (!selected) return;
    const text = newItemText.trim();
    if (!text) {
      itemError = 'Введите текст пункта';
      return;
    }
    if (text.length > 500) {
      itemError = 'Текст пункта не должен превышать 500 символов';
      return;
    }

    itemError = '';
    isSavingItem = true;
    try {
      const data: HabitatList = await api.post(`/api/v1/lists/${selected.id}/items`, {
        text,
        is_checked: false,
      });
      selected = data;
      newItemText = '';
      await loadLists();
    } catch (error: any) {
      itemError = messageOf(error);
    } finally {
      isSavingItem = false;
    }
  };

  const shareList = async () => {
    if (!selected) return;

    shareError = '';
    shareNotice = '';
    const recipients = parseRecipients(shareRecipients);
    if (recipients.length === 0) {
      shareError = 'Укажите хотя бы одного получателя';
      return;
    }

    isSharing = true;
    try {
      const data: { items: ListRecipient[] } = await api.post(
        `/api/v1/lists/${selected.id}/shares`,
        { recipients },
      );
      selected = {
        ...selected,
        recipients: data.items || [],
        recipients_count: (data.items || []).length,
      };
      shareRecipients = '';
      shareNotice = 'Доступ выдан.';
      await loadLists();
    } catch (error: any) {
      shareError = messageOf(error);
    } finally {
      isSharing = false;
    }
  };

  const revokeRecipient = async (recipient: ListRecipient) => {
    if (!selected) return;
    if (!window.confirm(`Отозвать доступ у ${recipient.display_name || recipient.email}?`)) {
      return;
    }

    shareError = '';
    shareNotice = '';
    const listId = selected.id;
    try {
      await api.delete(`/api/v1/lists/${listId}/shares/${recipient.user_id}`);
      const data: HabitatList = await api.get(`/api/v1/lists/${listId}`);
      selected = data;
      shareNotice = 'Доступ отозван.';
      await loadLists();
    } catch (error: any) {
      shareError = messageOf(error);
    }
  };

  const archiveList = async () => {
    if (!selected) return;
    if (!window.confirm(`Удалить список «${selected.title}»? Он станет недоступен всем.`)) {
      return;
    }

    try {
      await api.delete(`/api/v1/lists/${selected.id}`);
      detailOpen = false;
      selected = null;
      notice = 'Список удалён.';
      await loadLists();
    } catch (error: any) {
      itemError = messageOf(error);
    }
  };

  onMount(() => {
    void loadLists();
    if (initialListID) {
      void openListById(initialListID);
    }
  });
</script>

<div class="page-container">
  <header class="page-header">
    <div>
      <h1>Списки</h1>
      <p class="page-subtitle">
        Покупки, инвентарь и другие чек-листы. Получатели с доступом write могут редактировать.
      </p>
    </div>
    <div class="page-actions">
      <button class="secondary" on:click={() => dispatch('back')}>Назад</button>
      <button class="secondary" on:click={() => dispatch('messages')}>Сообщения</button>
      <button class="logout-btn" on:click={() => dispatch('logout')}>Выйти</button>
    </div>
  </header>

  <section class="card">
    <div class="messages-toolbar">
      <div class="messages-actions">
        <button on:click={openCreate}>Новый список</button>
        <button class="secondary" on:click={refresh}>Обновить</button>
      </div>
      <span class="hint">Всего: {total}</span>
    </div>

    {#if notice}
      <p class="success-message">{notice}</p>
    {/if}

    {#if listsError}
      <p class="error-message">{listsError}</p>
    {/if}

    {#if isLoading}
      <p class="loading-text">Загрузка списков...</p>
    {:else if lists.length === 0}
      <p class="empty-state">Списков пока нет. Создайте первый.</p>
    {:else}
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th>Владелец</th>
              <th>Пункты</th>
              <th>Доступ</th>
              <th>Обновлён</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each lists as list (list.id)}
              <tr>
                <td><strong>{list.title}</strong></td>
                <td>
                  {list.is_owner
                    ? 'Вы'
                    : list.owner.display_name || list.owner.email}
                </td>
                <td>{progress(list)}</td>
                <td><span class="badge {accessClass(list)}">{accessLabel(list)}</span></td>
                <td>{formatDate(list.updated_at)}</td>
                <td>
                  <button class="secondary small-btn" on:click={() => openList(list)}>
                    Открыть
                  </button>
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
        <select bind:value={limit} on:change={changePageSize} aria-label="Размер страницы">
          {#each PAGE_SIZE_OPTIONS as size}
            <option value={size}>{size} на странице</option>
          {/each}
        </select>
      </div>
    {/if}
  </section>
</div>

{#if createOpen}
  <div class="modal-overlay" role="presentation" on:click|self={closeCreate}>
    <div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="create-list-title">
      <h2 id="create-list-title">Новый список</h2>
      <p class="modal-subtitle">
        Название обязательно. Пункты можно добавить сразу или позже. Получатели задаются email или UUID.
      </p>

      <form on:submit|preventDefault={createList}>
        <div class="form-group">
          <label for="list-title">Название</label>
          <input
            id="list-title"
            type="text"
            maxlength="256"
            placeholder="Например, Покупки"
            bind:value={createTitle}
          />
        </div>

        <div class="form-group">
          <span class="form-label">Пункты</span>
          <div class="checklist">
            {#each draftItems as item, index (index)}
              <div class="checklist-row">
                <input type="checkbox" bind:checked={item.is_checked} aria-label="Отмечен" />
                <input
                  type="text"
                  maxlength="500"
                  placeholder="Название пункта"
                  bind:value={item.text}
                />
                <button
                  type="button"
                  class="danger-btn small-btn"
                  on:click={() => removeDraftItem(index)}
                >
                  Убрать
                </button>
              </div>
            {/each}
          </div>
          <button type="button" class="secondary small-btn" on:click={addDraftItem}>
            + Добавить пункт
          </button>
        </div>

        <div class="form-group">
          <label for="list-recipients">Поделиться с</label>
          <textarea
            id="list-recipients"
            rows="2"
            placeholder="alice@example.com, bob@example.com"
            bind:value={createRecipients}
          ></textarea>
          <span class="hint">Получатели смогут редактировать список.</span>
        </div>

        {#if createError}
          <p class="error-message">{createError}</p>
        {/if}

        <div class="buttons">
          <button type="submit" disabled={isCreating}>
            {isCreating ? 'Создание...' : 'Создать'}
          </button>
          <button type="button" class="secondary" on:click={closeCreate} disabled={isCreating}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if detailOpen && selected}
  <div class="modal-overlay" role="presentation" on:click|self={closeDetail}>
    <div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="list-detail-title">
      <div class="card-header">
        <h2 id="list-detail-title">Список</h2>
        <button
          class="secondary small-btn"
          on:click={closeDetail}
          disabled={isSharing || isSavingItem || isSavingTitle}
        >
          Закрыть
        </button>
      </div>

      {#if selected.can_edit}
        <form class="list-title-edit" on:submit|preventDefault={saveTitle}>
          <div class="form-group">
            <label for="edit-list-title">Название</label>
            <input id="edit-list-title" type="text" maxlength="256" bind:value={titleDraft} />
          </div>
          <button type="submit" class="secondary small-btn" disabled={isSavingTitle}>
            {isSavingTitle ? 'Сохранение...' : 'Сохранить'}
          </button>
        </form>
      {:else}
        <h3 class="list-detail-title-text">{selected.title}</h3>
      {/if}

      <p class="modal-subtitle">
        Владелец: {selected.owner.display_name || selected.owner.email} ·
        {selected.owner.email}
      </p>
      <p class="hint">Обновлён {formatDate(selected.updated_at)}</p>
      <p class="message-status">
        <span class="badge {accessClass(selected)}">{accessLabel(selected)}</span>
        <span class="list-progress-text">{progress(selected)}</span>
      </p>

      {#if selected.items_total > 0}
        <div class="progress-track" aria-hidden="true">
          <div
            class="progress-fill"
            style={`width: ${Math.round((selected.items_checked / selected.items_total) * 100)}%`}
          ></div>
        </div>
      {/if}

      {#if detailError}
        <p class="error-message">{detailError}</p>
      {/if}
      {#if isLoadingDetail}
        <p class="loading-text">Обновление списка...</p>
      {/if}

      <section class="detail-section">
        <h3>Пункты</h3>

        {#if selected.items && selected.items.length > 0}
          <div class="checklist">
            {#each selected.items as item (item.id)}
              <div class="checklist-row" class:checked-row={item.is_checked}>
                <input
                  type="checkbox"
                  checked={item.is_checked}
                  on:change={() => toggleItem(item)}
                  disabled={!selected.can_edit || isSavingItem}
                  aria-label={`Отметить «${item.text}»`}
                />
                <span class="checklist-text" class:checked={item.is_checked}>{item.text}</span>
                {#if selected.can_edit}
                  <div class="row-actions">
                    <button
                      class="secondary small-btn"
                      on:click={() => renameItem(item)}
                      disabled={isSavingItem}
                    >
                      Изменить
                    </button>
                    <button
                      class="danger-btn small-btn"
                      on:click={() => deleteItem(item)}
                      disabled={isSavingItem}
                    >
                      Удалить
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty-state">В списке пока нет пунктов.</p>
        {/if}

        {#if selected.can_edit}
          <form class="checklist-add-form" on:submit|preventDefault={addItem}>
            <input
              type="text"
              maxlength="500"
              placeholder="Новый пункт"
              bind:value={newItemText}
            />
            <button type="submit" class="secondary small-btn" disabled={isSavingItem}>
              Добавить
            </button>
          </form>
        {/if}

        {#if itemError}
          <p class="error-message">{itemError}</p>
        {/if}
      </section>

      {#if selected.is_owner}
        <section class="detail-section">
          <h3>Получатели</h3>

          {#if selected.recipients && selected.recipients.length > 0}
            <div class="recipient-list">
              {#each selected.recipients as recipient (recipient.user_id)}
                <div class="recipient-row">
                  <div>
                    <strong>{recipient.display_name || recipient.email}</strong>
                    <div class="hint">{recipient.email}</div>
                  </div>
                  <span class="badge {recipient.permission === 'write' ? 'badge-active' : 'badge-pending'}">
                    {recipient.permission === 'write' ? 'Редактирование' : 'Чтение'}
                  </span>
                  <button
                    class="danger-btn small-btn"
                    on:click={() => revokeRecipient(recipient)}
                    disabled={isSharing}
                  >
                    Отозвать
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty-state">Доступ никому не выдан.</p>
          {/if}

          <form class="share-form" on:submit|preventDefault={shareList}>
            <div class="form-group">
              <label for="list-share-recipients">Поделиться с</label>
              <input
                id="list-share-recipients"
                type="text"
                placeholder="email или UUID"
                bind:value={shareRecipients}
              />
            </div>
            <button type="submit" class="secondary small-btn" disabled={isSharing}>
              {isSharing ? 'Выдача доступа...' : 'Выдать доступ'}
            </button>
          </form>

          {#if shareError}
            <p class="error-message">{shareError}</p>
          {/if}
          {#if shareNotice}
            <p class="success-message">{shareNotice}</p>
          {/if}

          <div class="list-danger-zone">
            <button class="danger-btn" on:click={archiveList} disabled={isSharing || isSavingItem}>
              Удалить список
            </button>
          </div>
        </section>
      {/if}
    </div>
  </div>
{/if}
