// src/lib/alerts.js
import SwalCore from 'sweetalert2'
import withReactContent from 'sweetalert2-react-content'
import 'sweetalert2/dist/sweetalert2.min.css'

const Swal = withReactContent(SwalCore)

// Estilo base (verde Yuhmak)
const base = {
  buttonsStyling: false,
  reverseButtons: true,
  customClass: {
    popup: 'rounded-xl shadow-lg ring-1 ring-emerald-100',
    title: 'text-emerald-900 font-semibold',
    htmlContainer: 'text-emerald-800',
    confirmButton:
      'inline-flex items-center justify-center px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
    cancelButton:
      'inline-flex items-center justify-center px-4 py-2 rounded-md bg-white text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-50 ml-2',
  },
}

// Modales
export const modal = {
  success: (title = 'Listo', text) =>
    Swal.fire({ ...base, icon: 'success', title, text }),
  error: (title = 'Ups…', text) =>
    Swal.fire({ ...base, icon: 'error', title, text }),
  warning: (title = 'Atención', text) =>
    Swal.fire({ ...base, icon: 'warning', title, text }),
  info: (title = 'Info', text) =>
    Swal.fire({ ...base, icon: 'info', title, text }),
  confirm: ({
    title = '¿Confirmar?',
    text,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    icon = 'question',
  } = {}) =>
    Swal.fire({
      ...base,
      icon,
      title,
      text,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
    }),
}

// Toasts (arriba a la derecha)
const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2200,
  timerProgressBar: true,
  customClass: {
    popup: 'rounded-lg ring-1 ring-emerald-100',
    title: 'text-emerald-900',
  },
})

export const toast = {
  success: (title = 'Hecho') => Toast.fire({ icon: 'success', title }),
  error: (title = 'Error') => Toast.fire({ icon: 'error', title }),
  warning: (title = 'Atención') => Toast.fire({ icon: 'warning', title }),
  info: (title = 'Info') => Toast.fire({ icon: 'info', title }),
}

export default Swal
