<script setup lang="ts">
// Hosts the app-wide modal dialog opened through state/dialog.
import { closeDialog, dialog } from "../state/dialog";
</script>

<template>
  <component :is="dialog.component" v-if="dialog" v-bind="dialog.props" @close="closeDialog" />
</template>
