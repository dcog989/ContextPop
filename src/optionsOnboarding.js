// First-run orientation: a one-time callout on the options page explaining how the
// extension is used. Completion is persisted through the storage helpers.

function bindOnboarding() {
  elements.onboardingDismiss.addEventListener('click', async () => {
    await saveOnboardingComplete();
    elements.onboarding.hidden = true;
  });
}

/**
 * @returns {Promise<void>}
 */
async function revealOnboarding() {
  if (await loadOnboardingComplete()) return;
  elements.onboarding.hidden = false;
}
