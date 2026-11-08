<script lang="ts">
import '../app.css';

let { children } = $props();
</script>
<svelte:head><meta name="description" content="Make a decision with a shared puck."></svelte:head>
<nav aria-label="Home"><a href="/">Puck</a></nav>
<main>{@render children()}</main>
