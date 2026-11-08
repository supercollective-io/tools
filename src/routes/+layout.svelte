<script lang="ts">
import '../app.css';

let { children } = $props();
</script>
<svelte:head
  ><meta
    name="description"
    content="A shared space for making decisions together. Pull, reconsider, find a direction."
  ></svelte:head
>
<header class="site-header">
  <a href="/" class="brand" aria-label="Puck home"
    ><span class="brand-mark"></span>Puck<span class="brand-period">.</span></a
  ><span class="header-note">A little collective intelligence.</span>
</header>
<main>{@render children()}</main>
<footer class="site-footer">
  <span>Different perspectives. One moving point.</span><span>Experimental · baseline v1</span>
</footer>
