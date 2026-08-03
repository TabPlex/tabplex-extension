export const blurIfWorkspaceNameInputActive = ({
  activeElement,
  nameInput
}: {
  activeElement: Element | null
  nameInput: HTMLInputElement | null
}) => {
  if (!nameInput || activeElement !== nameInput) {
    return false
  }

  nameInput.blur()
  return true
}
