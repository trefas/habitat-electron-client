<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import '../app.css';

  const dispatch = createEventDispatcher();

  let host = 'localhost';
  let port = '8080';
  let protocol = 'http';

  onMount(async () => {
    const config = await window.electronAPI.getServerConfig();
    if (config.serverBaseUrl) {
      try {
        const url = new URL(config.serverBaseUrl);
        protocol = url.protocol.replace(':', '');
        host = url.hostname;
        port = url.port;
      } catch (e) {
        // Fallback to defaults if URL is invalid
      }
    }
  });

  const handleSave = () => {
    const baseUrl = `${protocol}://${host}:${port}`;
    dispatch('save', baseUrl);
  };

  const handleCancel = () => {
    dispatch('cancel');
  };
</script>

<div 
  class="modal-overlay" 
  on:click|self={handleCancel} 
  on:keydown={(e) => e.key === 'Escape' && handleCancel()} 
  role="dialog" 
  aria-modal="true"
  tabindex="-1"
>
  <div class="modal">
    <h2>Настройки сервера</h2>
    <form on:submit|preventDefault={handleSave}>
      <div class="form-group">
        <label for="protocol">Протокол</label>
        <select id="protocol" bind:value={protocol}>
          <option value="http">http</option>
          <option value="https">https</option>
        </select>
      </div>
      <div class="form-group">
        <label for="host">Хост (домен или IP)</label>
        <input id="host" type="text" bind:value={host} required placeholder="localhost или 192.168.0.12" />
      </div>
      <div class="form-group">
        <label for="port">Порт</label>
        <input id="port" type="number" bind:value={port} required min="1" max="65535" />
      </div>
      <div class="buttons">
        <button type="button" on:click={handleCancel}>Отмена</button>
        <button type="submit">Сохранить</button>
      </div>
    </form>
  </div>
</div>