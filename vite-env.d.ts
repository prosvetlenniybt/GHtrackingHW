import { useEffect, useMemo, useState } from "react";

type Owner = "Я" | "Разработчик" | "Аналитик" | "Саппорт" | "Я / Разработчик";

type TaskStatus =
  | "not_started"
  | "in_progress"
  | "review"
  | "done"
  | "blocked"
  | "not_required";

type ProjectStatus =
  | "Подготовка"
  | "Готов к выкату"
  | "В эксперименте"
  | "Ждет расчета"
  | "Ждет презентации"
  | "Ждет удаления"
  | "Завершено"
  | "Заблокировано";

type Task = {
  id: string;
  title: string;
  owner: Owner;
  required: boolean;
  status: TaskStatus;
  dependency?: string;
  note?: string;
};

type Project = {
  id: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  experimentDays?: number;
  currentExperimentDay?: number;
  xp: number;
  tasks: Task[];
};

const STORAGE_KEY = "experiment-quest-projects-v1";
const SYNC_CONFIG_KEY = "experiment-quest-jsonbin-config-v1";

type JsonBinConfig = {
  binId: string;
  apiKey: string;
};

type SyncState = "idle" | "loading" | "success" | "error";

type SyncStatus = {
  state: SyncState;
  message: string;
};

const statusLabels: Record<TaskStatus, string> = {
  not_started: "Не начато",
  in_progress: "В работе",
  review: "На проверке",
  done: "Готово",
  blocked: "Блокер",
  not_required: "Не требуется",
};

const taskOrder: Omit<Task, "id" | "status">[] = [
  { title: "Макеты", owner: "Я", required: true },
  {
    title: "Лендинги",
    owner: "Я / Разработчик",
    required: true,
    dependency: "Макеты",
  },
  { title: "БЗРБ", owner: "Я", required: true },
  {
    title: "Заявки",
    owner: "Я",
    required: true,
    dependency: "БЗРБ",
  },
  {
    title: "Кусы",
    owner: "Аналитик",
    required: true,
    dependency: "Заявки",
  },
  {
    title: "Тестовый выкат",
    owner: "Саппорт",
    required: false,
    dependency: "Кусы",
    note: "Опционально. Если включаем, нужны доп. заявки.",
  },
  {
    title: "Выкат",
    owner: "Саппорт",
    required: true,
    dependency: "Кусы",
  },
  {
    title: "Посчитать",
    owner: "Аналитик",
    required: true,
    dependency: "Завершение эксперимента",
  },
  {
    title: "Презентация",
    owner: "Я",
    required: true,
    dependency: "Расчет",
  },
  {
    title: "Удалить",
    owner: "Саппорт",
    required: true,
    dependency: "Презентация / решение",
  },
];

function makeTasks(projectId: string, doneCount = 0): Task[] {
  return taskOrder.map((task, index) => ({
    ...task,
    id: `${projectId}-${index}`,
    status:
      index < doneCount
        ? "done"
        : index === doneCount
          ? "in_progress"
          : "not_started",
  }));
}

const initialProjects: Project[] = [
  {
    id: "smart-camera",
    title: "Умная камера. Профайлер",
    description: "Проверка профайлера на лендинге и воронке.",
    status: "Подготовка",
    xp: 120,
    tasks: makeTasks("smart-camera", 3),
  },
  {
    id: "ai-recruiter",
    title: "ИИ-рекрутер",
    description: "Эксперимент по ИИ-рекрутингу.",
    status: "Подготовка",
    xp: 60,
    tasks: makeTasks("ai-recruiter", 1),
  },
  {
    id: "ai-services",
    title: "ИИ-сервисы",
    description: "Макеты и дизайн эксперимента.",
    status: "Подготовка",
    xp: 30,
    tasks: makeTasks("ai-services", 0),
  },
  {
    id: "insurance-wording",
    title: "4.0 Страховка. Формулировка",
    status: "Подготовка",
    xp: 0,
    tasks: makeTasks("insurance-wording", 0),
  },
  {
    id: "elasticity",
    title: "4.1 Эластичность спроса",
    status: "Подготовка",
    xp: 0,
    tasks: makeTasks("elasticity", 0),
  },
  {
    id: "insurance-landing",
    title: "4.2 Страховка. Лендинг",
    status: "Подготовка",
    xp: 0,
    tasks: makeTasks("insurance-landing", 0),
  },
  {
    id: "insurance-tariffs",
    title: "4.3 Страховка. Тарифы",
    status: "Подготовка",
    xp: 0,
    tasks: makeTasks("insurance-tariffs", 0),
  },
  {
    id: "double-combo-account",
    title: "Двойное прикладывание комбо-счета",
    status: "Подготовка",
    xp: 0,
    tasks: makeTasks("double-combo-account", 0),
  },
];

function loadProjectsFromStorage(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialProjects;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return initialProjects;

    return parsed;
  } catch {
    return initialProjects;
  }
}

function saveProjectsToStorage(projects: Project[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function loadJsonBinConfig(): JsonBinConfig {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    if (!raw) return { binId: "", apiKey: "" };

    const parsed = JSON.parse(raw);

    return {
      binId: typeof parsed.binId === "string" ? parsed.binId : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
    };
  } catch {
    return { binId: "", apiKey: "" };
  }
}

function saveJsonBinConfig(config: JsonBinConfig) {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
}

function getJsonBinPayload(projects: Project[]) {
  return {
    app: "experiment-quest",
    version: 1,
    updatedAt: new Date().toISOString(),
    projects,
  };
}

function getProjectsFromJsonBinPayload(payload: unknown): Project[] {
  if (Array.isArray(payload)) return payload as Project[];

  if (payload && typeof payload === "object" && "projects" in payload) {
    const maybeProjects = (payload as { projects?: unknown }).projects;
    if (Array.isArray(maybeProjects)) return maybeProjects as Project[];
  }

  throw new Error("В JSONBin не найден массив projects.");
}

function getJsonBinHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    "X-Master-Key": apiKey,
  };
}

async function readProjectsFromJsonBin(config: JsonBinConfig): Promise<Project[]> {
  const response = await fetch(
    `https://api.jsonbin.io/v3/b/${config.binId}/latest`,
    {
      method: "GET",
      headers: {
        "X-Master-Key": config.apiKey,
        "X-Bin-Meta": "false",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Ошибка загрузки: ${response.status}`);
  }

  const payload = await response.json();
  return getProjectsFromJsonBinPayload(payload);
}

async function saveProjectsToJsonBin(config: JsonBinConfig, projects: Project[]) {
  const response = await fetch(`https://api.jsonbin.io/v3/b/${config.binId}`, {
    method: "PUT",
    headers: getJsonBinHeaders(config.apiKey),
    body: JSON.stringify(getJsonBinPayload(projects)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Ошибка сохранения: ${response.status}`);
  }

  return response.json();
}

async function createJsonBin(apiKey: string, projects: Project[]) {
  const response = await fetch("https://api.jsonbin.io/v3/b", {
    method: "POST",
    headers: {
      ...getJsonBinHeaders(apiKey),
      "X-Bin-Private": "true",
      "X-Bin-Name": "Experiment Quest Tracker",
    },
    body: JSON.stringify(getJsonBinPayload(projects)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Ошибка создания bin: ${response.status}`);
  }

  return response.json() as Promise<{ metadata?: { id?: string } }>;
}

function getProgress(project: Project) {
  const requiredTasks = project.tasks.filter((task) => task.required);
  const doneTasks = requiredTasks.filter((task) => task.status === "done");
  return Math.round((doneTasks.length / requiredTasks.length) * 100);
}

function getNextTask(project: Project) {
  return project.tasks.find(
    (task) =>
      task.required &&
      task.status !== "done" &&
      task.status !== "not_required"
  );
}

function getReadiness(project: Project) {
  const preLaunchTasks = ["Макеты", "Лендинги", "БЗРБ", "Заявки", "Кусы"];
  const items = project.tasks.filter((task) => preLaunchTasks.includes(task.title));
  const ready = items.every((task) => task.status === "done");

  return {
    ready,
    items,
    done: items.filter((task) => task.status === "done").length,
    total: items.length,
  };
}

function getStatusByProgress(project: Project): ProjectStatus {
  const readiness = getReadiness(project);
  const progress = getProgress(project);

  if (project.tasks.some((task) => task.status === "blocked")) return "Заблокировано";
  if (progress === 100) return "Завершено";

  if (
    readiness.ready &&
    project.tasks.find((task) => task.title === "Выкат")?.status !== "done"
  ) {
    return "Готов к выкату";
  }

  return project.status;
}

function App() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjectsFromStorage());
  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    const storedProjects = loadProjectsFromStorage();
    return storedProjects[0]?.id ?? initialProjects[0].id;
  });
  const [ownerFilter, setOwnerFilter] = useState<Owner | "Все">("Все");
  const [jsonBinConfig, setJsonBinConfig] = useState<JsonBinConfig>(() => loadJsonBinConfig());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: "idle",
    message: "JSONBin не подключен",
  });

  useEffect(() => {
    saveProjectsToStorage(projects);
  }, [projects]);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? initialProjects[0];

  const filteredProjects = useMemo(() => {
    if (ownerFilter === "Все") return projects;

    return projects.filter((project) =>
      project.tasks.some(
        (task) =>
          task.owner === ownerFilter &&
          task.status !== "done" &&
          task.status !== "not_required"
      )
    );
  }, [projects, ownerFilter]);

  const totalXp = projects.reduce((sum, project) => sum + project.xp, 0);
  const completedProjects = projects.filter((project) => getProgress(project) === 100).length;

  function updateTaskStatus(projectId: string, taskId: string, status: TaskStatus) {
    setProjects((currentProjects) =>
      currentProjects.map((project) => {
        if (project.id !== projectId) return project;

        const oldTask = project.tasks.find((task) => task.id === taskId);
        const updatedProject = {
          ...project,
          tasks: project.tasks.map((task) =>
            task.id === taskId ? { ...task, status } : task
          ),
        };

        const becameDone = oldTask?.status !== "done" && status === "done";
        const stoppedBeingDone = oldTask?.status === "done" && status !== "done";

        let nextXp = project.xp;
        if (becameDone) nextXp += 20;
        if (stoppedBeingDone) nextXp = Math.max(0, nextXp - 20);

        const withXp = { ...updatedProject, xp: nextXp };
        return { ...withXp, status: getStatusByProgress(withXp) };
      })
    );
  }

  function setProjectStatus(projectId: string, status: ProjectStatus) {
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId ? { ...project, status } : project
      )
    );
  }

  function resetAllData() {
    const confirmed = window.confirm("Сбросить все изменения и вернуть стартовые проекты?");
    if (!confirmed) return;

    localStorage.removeItem(STORAGE_KEY);
    setProjects(initialProjects);
    setSelectedProjectId(initialProjects[0].id);
  }

  function exportData() {
    const data = JSON.stringify(getJsonBinPayload(projects), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "experiment-tracker-data.json";
    link.click();

    URL.revokeObjectURL(url);
  }

  function updateJsonBinConfig(config: JsonBinConfig) {
    setJsonBinConfig(config);
    saveJsonBinConfig(config);
    setSyncStatus({
      state: config.binId && config.apiKey ? "success" : "idle",
      message: config.binId && config.apiKey ? "Настройки JSONBin сохранены" : "JSONBin не подключен",
    });
  }

  function ensureJsonBinConfig() {
    if (!jsonBinConfig.apiKey.trim()) {
      throw new Error("Добавь API key JSONBin.");
    }

    if (!jsonBinConfig.binId.trim()) {
      throw new Error("Добавь Bin ID или создай новый bin.");
    }
  }

  async function handleLoadFromJsonBin() {
    try {
      ensureJsonBinConfig();
      setSyncStatus({ state: "loading", message: "Загружаю данные из JSONBin..." });

      const remoteProjects = await readProjectsFromJsonBin(jsonBinConfig);
      setProjects(remoteProjects);
      setSelectedProjectId(remoteProjects[0]?.id ?? initialProjects[0].id);

      setSyncStatus({ state: "success", message: "Данные загружены из JSONBin" });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Не удалось загрузить данные",
      });
    }
  }

  async function handleSaveToJsonBin() {
    try {
      ensureJsonBinConfig();
      setSyncStatus({ state: "loading", message: "Сохраняю данные в JSONBin..." });

      await saveProjectsToJsonBin(jsonBinConfig, projects);

      setSyncStatus({ state: "success", message: "Данные сохранены в JSONBin" });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Не удалось сохранить данные",
      });
    }
  }

  async function handleCreateJsonBin() {
    try {
      if (!jsonBinConfig.apiKey.trim()) {
        throw new Error("Добавь API key JSONBin, чтобы создать bin.");
      }

      setSyncStatus({ state: "loading", message: "Создаю новый bin в JSONBin..." });

      const result = await createJsonBin(jsonBinConfig.apiKey, projects);
      const createdBinId = result.metadata?.id;

      if (!createdBinId) {
        throw new Error("Bin создан, но API не вернул id. Проверь JSONBin вручную.");
      }

      const nextConfig = { ...jsonBinConfig, binId: createdBinId };
      setJsonBinConfig(nextConfig);
      saveJsonBinConfig(nextConfig);

      setSyncStatus({
        state: "success",
        message: `Создан и подключен bin: ${createdBinId}`,
      });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Не удалось создать bin",
      });
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMascot">◆</div>
          <div>
            <div className="brandTitle">Experiment Quest</div>
            <div className="brandSubtitle">project tracker</div>
          </div>
        </div>

        <nav className="nav">
          <button className="navItem active">Квесты</button>
          <button className="navItem">Моя очередь</button>
          <button className="navItem">Аналитика</button>
          <button className="navItem">Архив</button>
        </nav>

        <div className="streakCard">
          <div className="streakIcon">🔥</div>
          <div>
            <strong>7 дней</strong>
            <span>рабочий стрик</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>Трекер экспериментов</h1>
            <p>Закрывай этапы, копи XP и доводи проекты до выката.</p>
          </div>

          <div className="profile">
            <button className="pill actionPill" onClick={exportData}>⬇️ Экспорт</button>
            <button className="pill actionPill danger" onClick={resetAllData}>↺ Сброс</button>
            <div className="pill">⚡ {totalXp} XP</div>
            <div className="pill">🏁 {completedProjects}/{projects.length}</div>
            <div className="avatar">IA</div>
          </div>
        </header>

        <section className="hero">
          <div>
            <div className="heroBadge">Сегодняшний фокус</div>
            <h2>{getNextTask(selectedProject)?.title ?? "Все задачи закрыты"}</h2>
            <p>Следующий шаг по проекту: <b>{selectedProject.title}</b></p>
          </div>

          <button className="primaryButton">Продолжить квест</button>
        </section>

        <section className="filters">
          {(["Все", "Я", "Я / Разработчик", "Разработчик", "Аналитик", "Саппорт"] as const).map((owner) => (
            <button
              key={owner}
              className={ownerFilter === owner ? "filter active" : "filter"}
              onClick={() => setOwnerFilter(owner)}
            >
              {owner}
            </button>
          ))}
        </section>

        <JsonBinSyncPanel
          config={jsonBinConfig}
          status={syncStatus}
          onConfigChange={updateJsonBinConfig}
          onCreateBin={handleCreateJsonBin}
          onLoad={handleLoadFromJsonBin}
          onSave={handleSaveToJsonBin}
        />

        <section className="layout">
          <section className="projectGrid">
            {filteredProjects.map((project) => {
              const progress = getProgress(project);
              const nextTask = getNextTask(project);
              const readiness = getReadiness(project);
              const isSelected = selectedProjectId === project.id;

              return (
                <article
                  key={project.id}
                  className={isSelected ? "projectCard selected" : "projectCard"}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <div className="cardHeader">
                    <div className="projectIcon">
                      {progress === 100 ? "🏆" : readiness.ready ? "🚀" : "🧩"}
                    </div>
                    <div className="cardStatus">{getStatusByProgress(project)}</div>
                  </div>

                  <h3>{project.title}</h3>
                  <p className="cardDescription">
                    {project.description ?? "Экспериментальный проект"}
                  </p>

                  <div className="progressBlock">
                    <div className="progressLabel">
                      <span>Готовность</span>
                      <strong>{progress}%</strong>
                    </div>
                    <div className="progressTrack">
                      <div className="progressFill" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="nextStep">
                    <span>Следующий шаг</span>
                    <b>{nextTask?.title ?? "Готово"}</b>
                  </div>

                  <div className="miniChecklist">
                    {readiness.items.map((task) => (
                      <span
                        key={task.id}
                        className={task.status === "done" ? "dot done" : "dot"}
                        title={task.title}
                      />
                    ))}
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="detailsPanel">
            <div className="detailsHeader">
              <div>
                <div className="sectionLabel">Активный проект</div>
                <h2>{selectedProject.title}</h2>
              </div>
              <div className="bigIcon">🦉</div>
            </div>

            <ProjectStatusSelect
              value={selectedProject.status}
              onChange={(status) => setProjectStatus(selectedProject.id, status)}
            />

            <ReadinessBlock project={selectedProject} />

            <div className="path">
              {selectedProject.tasks.map((task, index) => (
                <div key={task.id} className="pathItem">
                  <div className="pathRail">
                    <button
                      className={`levelButton ${task.status}`}
                      onClick={() => {
                        const nextStatus: TaskStatus = task.status === "done" ? "in_progress" : "done";
                        updateTaskStatus(selectedProject.id, task.id, nextStatus);
                      }}
                    >
                      {task.status === "done" ? "✓" : index + 1}
                    </button>
                  </div>

                  <div className="taskCard">
                    <div className="taskTop">
                      <div>
                        <h4>{task.title}</h4>
                        <p>{task.required ? "Обязательный этап" : "Опционально"} · {task.owner}</p>
                      </div>

                      <select
                        value={task.status}
                        onChange={(event) =>
                          updateTaskStatus(
                            selectedProject.id,
                            task.id,
                            event.target.value as TaskStatus
                          )
                        }
                      >
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>

                    {(task.dependency || task.note) && (
                      <div className="taskMeta">
                        {task.dependency && <span>Зависит от: {task.dependency}</span>}
                        {task.note && <span>{task.note}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

function JsonBinSyncPanel({
  config,
  status,
  onConfigChange,
  onCreateBin,
  onLoad,
  onSave,
}: {
  config: JsonBinConfig;
  status: SyncStatus;
  onConfigChange: (config: JsonBinConfig) => void;
  onCreateBin: () => void;
  onLoad: () => void;
  onSave: () => void;
}) {
  const isLoading = status.state === "loading";

  return (
    <section className="syncPanel">
      <div className="syncHeader">
        <div>
          <div className="sectionLabel">Cloud sync</div>
          <h3>Привязка к JSONBin</h3>
          <p>LocalStorage остается локальным кэшем, JSONBin — общим облачным хранилищем.</p>
        </div>

        <div className={`syncStatus ${status.state}`}>{status.message}</div>
      </div>

      <div className="syncForm">
        <label>
          <span>Bin ID</span>
          <input
            value={config.binId}
            placeholder="Например: 665f..."
            onChange={(event) => onConfigChange({ ...config, binId: event.target.value.trim() })}
          />
        </label>

        <label>
          <span>API key</span>
          <input
            value={config.apiKey}
            type="password"
            placeholder="X-Master-Key"
            onChange={(event) => onConfigChange({ ...config, apiKey: event.target.value.trim() })}
          />
        </label>

        <div className="syncActions">
          <button className="syncButton" onClick={onCreateBin} disabled={isLoading}>
            + Создать bin
          </button>
          <button className="syncButton" onClick={onLoad} disabled={isLoading}>
            Обновить из JSONBin
          </button>
          <button className="syncButton primary" onClick={onSave} disabled={isLoading}>
            Сохранить в JSONBin
          </button>
        </div>
      </div>
    </section>
  );
}

function ReadinessBlock({ project }: { project: Project }) {
  const readiness = getReadiness(project);
  const nextTask = getNextTask(project);

  return (
    <section className={readiness.ready ? "readiness ready" : "readiness"}>
      <div className="readinessTop">
        <div>
          <div className="sectionLabel">Готовность к выкату</div>
          <h3>{readiness.done}/{readiness.total} этапов</h3>
        </div>
        <div className="readinessBadge">{readiness.ready ? "Можно выкатывать" : "Еще рано"}</div>
      </div>

      <div className="launchChecklist">
        {readiness.items.map((task) => (
          <div key={task.id} className="launchItem">
            <span>{task.status === "done" ? "✅" : "⬜"}</span>
            <b>{task.title}</b>
          </div>
        ))}
      </div>

      <div className="nextActionBox">
        <span>Следующее действие</span>
        <strong>{nextTask?.title ?? "Проект готов"}</strong>
      </div>
    </section>
  );
}

function ProjectStatusSelect({
  value,
  onChange,
}: {
  value: ProjectStatus;
  onChange: (value: ProjectStatus) => void;
}) {
  const statuses: ProjectStatus[] = [
    "Подготовка",
    "Готов к выкату",
    "В эксперименте",
    "Ждет расчета",
    "Ждет презентации",
    "Ждет удаления",
    "Завершено",
    "Заблокировано",
  ];

  return (
    <label className="statusSelect">
      <span>Статус проекта</span>
      <select value={value} onChange={(event) => onChange(event.target.value as ProjectStatus)}>
        {statuses.map((status) => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
    </label>
  );
}

export default App;
