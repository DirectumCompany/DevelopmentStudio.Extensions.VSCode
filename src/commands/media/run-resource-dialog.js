(function () {
  const IDENTIFIER_REGEX = /^([a-zA-Z]){1}([a-zA-Z0-9_]){0,}/;

  const RESOURCE_NAME = 'resource name';
  const RESOURCE_VALUE = 'resource value';

  const RULES = {
    Empty: { check: (value) => isEmptyOrWhiteSpace(value), error: (name) => `${capitalize(name)} cannot be empty.` },
    EndsFormat: {
      check: (value) => value.toLowerCase().endsWith('format'),
      error: (name) => `${capitalize(name)} cannot end with "Format".`,
    },
    RegExp: {
      check: (value) => IDENTIFIER_REGEX.exec(value)?.[0].length !== value.length,
      error: () => 'The value must start with a letter and can only contain the Latin alphabet and digits.',
    },
  };

  const FIELDS = [
    {
      id: 'resource-name',
      name: RESOURCE_NAME,
      onChanged: (event) => {
        event.target.value = capitalize(event.target.value);
      },
      rules: [RULES.Empty, RULES.EndsFormat, RULES.RegExp],
    },
    {
      id: 'default-language',
      name: RESOURCE_VALUE,
      rules: [RULES.Empty],
    },
    {
      id: 'ru-language',
      name: RESOURCE_VALUE,
      rules: [RULES.Empty],
    },
  ];

  /** Кэш элементов. */
  const dom = {
    errorsContainer: document.getElementById('server-errors'),
    createButton: document.getElementById('create-resource'),
    cancelButton: document.getElementById('cancel-create-resource'),
    fields: {},
  };

  /** Кэш элементов полей. */
  FIELDS.forEach((field) => {
    dom.fields[field.id] = {
      element: document.getElementById(field.id),
      error: document.getElementById(`${field.id}-error`),
    };
  });

  const vscode = acquireVsCodeApi();

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /** Создать ресурсы. */
  function createResource() {
    vscode.postMessage({
      command: 'createResource',
      input: dom.fields['resource-name'].element.value,
      en: dom.fields['default-language'].element.value,
      ru: dom.fields['ru-language'].element.value,
    });
  }

  /** Отменить. */
  function cancel() {
    vscode.postMessage({ command: 'cancel' });
  }

  /** Обработать горячие клавиши. */
  function handleKeyboardShortcuts(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      if (!dom.createButton.disabled) {
        dom.createButton.click();
      }
    }
  }

  /** Проверить, что строка пустая или состоит только из пробелов. */
  function isEmptyOrWhiteSpace(value) {
    return value === null || value === undefined || value.trim().length === 0;
  }

  function clearServerErrors(errorsElement) {
    errorsElement.classList.remove('visible');
    errorsElement.textContent = '';
  }

  function showServerErrors(errors) {
    const serverErrors = dom.errorsContainer;

    if (!errors || errors.length === 0) {
      clearServerErrors(serverErrors);
      return;
    }

    const ul = document.createElement('ul');
    errors.forEach((error) => {
      const li = document.createElement('li');
      li.textContent = error;
      ul.appendChild(li);
    });

    serverErrors.textContent = '';
    serverErrors.appendChild(ul);
    serverErrors.classList.add('visible');
  }

  /** Обновить хинт с ошибкой. */
  function updateHintErrors(fieldId, error) {
    if (error) {
      dom.fields[fieldId].element.classList.add('error-field');
      dom.fields[fieldId].error.textContent = error;
    } else {
      dom.fields[fieldId].element.classList.remove('error-field');
      dom.fields[fieldId].error.textContent = '';
    }
  }

  /** Провалидировать. */
  function validate(field, value) {
    const getError = () => {
      const rules = field?.rules;
      for (const rule of rules) {
        if (rule.check(value)) {
          return rule.error(field.name);
        }
      }
      return null;
    };

    updateHintErrors(field.id, getError());
  }

  /** Обновить доступность кнопки создания. */
  function updateEnableCreateButton() {
    const existError = FIELDS.some((field) => !isEmptyOrWhiteSpace(dom.fields[field.id].error.textContent));
    dom.createButton.disabled = existError;
  }

  /** Инициализировать. */
  function init() {
    // Обработчики событий от расширения.
    window.addEventListener('message', (event) => {
      const message = event.data;

      if (message.type === 'serverError') {
        showServerErrors(message.errors);
      }
    });

    dom.cancelButton.addEventListener('click', cancel);
    dom.createButton.addEventListener('click', createResource);

    document.addEventListener('keydown', handleKeyboardShortcuts);

    FIELDS.forEach((field) => {
      const element = dom.fields[field.id].element;

      element.addEventListener('blur', (event) => {
        if (field.onChanged) field.onChanged(event);
        validate(field, event.target.value);
        updateEnableCreateButton();
      });
    });

    dom.fields['resource-name'].element.focus();
  }

  init();
})();
