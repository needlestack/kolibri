/* eslint-env node */
import { TaskResource } from 'kolibri.resources';
import { samePageCheckGenerator } from 'kolibri.coreVue.vuex.actions';
import logger from 'kolibri.lib.logging';
import { closeImportExportWizard } from './contentWizardActions';
import isEqual from 'lodash/isEqual';
import pick from 'lodash/fp/pick';

const logging = logger.getLogger(__filename);

function transformTasks(tasks) {
  return tasks.map(task => ({
    id: task.id,
    type: task.type,
    status: task.status,
    metadata: task.metadata,
    percentage: task.percentage,
    cancellable: task.cancellable,
  }));
}

export function fetchCurrentTasks() {
  return TaskResource.getCollection()
    .fetch()
    .then(transformTasks);
}

export function cancelTask(store, taskId) {
  return TaskResource.cancelTask(taskId).then(function onSuccess() {
    updateTasks(store, []);
  });
}

function updateTasks(store, tasks) {
  store.dispatch('SET_CONTENT_PAGE_TASKS', transformTasks(tasks));
}

function triggerTask(store, taskPromise) {
  store.dispatch('SET_CONTENT_PAGE_WIZARD_BUSY', true);
  return taskPromise
    .then(function onSuccess(task) {
      updateTasks(store, [task.entity]);
      closeImportExportWizard(store);
    })
    .catch(function onFailure(error) {
      let errorText;
      if (error.status.code === 404) {
        errorText = 'That ID was not found on our server.';
      } else {
        errorText = error.status.text;
      }
      store.dispatch('SET_CONTENT_PAGE_WIZARD_ERROR', errorText);
      store.dispatch('SET_CONTENT_PAGE_WIZARD_BUSY', false);
    });
}

export function triggerLocalContentImportTask(store, driveId) {
  return triggerTask(store, TaskResource.localImportContent(driveId));
}

export function triggerLocalContentExportTask(store, driveId) {
  return triggerTask(store, TaskResource.localExportContent(driveId));
}

export function triggerRemoteContentImportTask(store, channelId) {
  return triggerTask(store, TaskResource.remoteImportContent(channelId));
}

export function triggerChannelDeleteTask(store, channelId) {
  return triggerTask(store, TaskResource.deleteChannel(channelId));
}

function taskList(state) {
  return state.pageState.taskList;
}

/**
 * Basically, a simplified version of pollTasks.
 *
 */
export function refreshTaskList(store) {
  // need to convert observable to plain Object to make it deep-comparable
  const simplifyTask = pick(['id', 'status', 'percentage']);
  return TaskResource.getCollection().fetch({}, true)
    .then(tasks => {
      const storeTasks = taskList(store.state);
      const lengthDiffers = tasks.length !== storeTasks.length;
      const storeTask = simplifyTask(storeTasks[0] || {});
      const fetchedTask = simplifyTask(tasks[0] || {});
      const firstTaskDiffers = !isEqual(storeTask, fetchedTask);
      if (lengthDiffers || firstTaskDiffers) {
        updateTasks(store, tasks);
      }
    });
}

export function pollTasks(store) {
  const samePageCheck = samePageCheckGenerator(store);
  TaskResource.getCollection()
    .fetch({}, true)
    .only(
      // don't handle response if we've switched pages or if we're in the middle of another operation
      () => samePageCheck() && !store.state.pageState.wizardState.busy,
      taskList => {
        updateTasks(store, taskList);
        if (taskList.length && store.state.pageState.wizardState.shown) {
          // closeImportExportWizard(store);
        }
      },
      error => {
        logging.error(`poll error: ${error}`);
      }
    );
}
