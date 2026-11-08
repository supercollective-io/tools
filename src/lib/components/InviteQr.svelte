<script lang="ts">
let open = $state(false);
let image = $state('');
let url = $state('');
let error = $state('');
let localOnly = $state(false);

async function toggle() {
  open = !open;
  if (!open || image) return;
  url = new URL(location.pathname, location.origin).href;
  localOnly = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  error = '';
  try {
    const { default: QRCode } = await import('qrcode');
    image = await QRCode.toDataURL(url, { width: 288, margin: 4, errorCorrectionLevel: 'M' });
  } catch {
    error = 'Could not generate the QR code. Use the invite link instead.';
  }
}
</script>

<button type="button" onclick={toggle} aria-expanded={open} aria-controls="invite-qr">
  {open ? 'Hide QR code' : 'Show QR code'}
</button>
<div id="invite-qr" hidden={!open} class="invite-qr">
  {#if error}
    <p role="alert">{error}</p>
  {:else if image}
    <img src={image} width="288" height="288" alt="Scan to join this room">
    <a href={url}>{url}</a>
    {#if localOnly}
      <p class="muted">
        This address only works on this device. Open the room using a shared network or public
        address before inviting phones.
      </p>
    {/if}
  {:else}
    <p role="status">Generating QR code…</p>
  {/if}
</div>

<style>
.invite-qr {
  flex-basis: 100%;
  order: 1;
}
.invite-qr img {
  display: block;
  max-width: 100%;
  height: auto;
}
.invite-qr a {
  display: block;
  overflow-wrap: anywhere;
  font-size: 0.875rem;
}
</style>
