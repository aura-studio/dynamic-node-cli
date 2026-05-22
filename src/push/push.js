import { newTaskList } from "./task-list.js";
import { S3Remote } from "./remote.js";

export async function pushForProcedure(proc) {
  const taskList = await newTaskList(proc);
  for (const [remote, tasks] of taskList.tasks) {
    const target = new S3Remote(remote);
    await target.push(tasks);
  }
}
