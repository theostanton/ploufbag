import {Request, Response} from "express";
import {TaskBody, isSuccess} from "@ploufbag/common";
import {taskHandlers} from "@/tasks/model";

export default async function handler(req: Request, res: Response): Promise<void> {
    console.log("Received task request:", {
        body: req.body,
        headers: req.headers,
        method: req.method
    });

    try {
        const task: TaskBody = req.body;

        if (!task || !task.name) {
            const errorMessage = `No task name provided in body=${JSON.stringify(req.body)}`;
            console.error(errorMessage);
            res.status(400).json({
                status: "error",
                message: errorMessage
            });
            return;
        }

        console.log(`Executing task: ${task.name}`);

        // Execute task (monitoring temporarily disabled)
        const taskHandler = taskHandlers[task.name as keyof typeof taskHandlers];
        if (!taskHandler) {
            throw new Error(`No handler found for task: ${task.name}`);
        }

        const result = await taskHandler(task);

        if (result.success) {
            console.log(`Task ${task.name} completed successfully`);
            res.status(200).json({
                status: "success",
                task: task.name,
                message: "Task completed successfully"
            });
        } else {
            console.error(`Task ${task.name} failed: ${result.message}`);
            res.status(500).json({
                status: "failed",
                task: task.name,
                message: result.message
            });
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Error in task handler:", error);

        res.status(500).json({
            status: "error",
            message: errorMessage
        });
    }
}