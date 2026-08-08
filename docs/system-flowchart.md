# FocusFlow System Flowchart

```mermaid
flowchart TD
    A([Start]) --> B[Launch Application]
    B --> C[Load Home Screen]
    C --> D{User already authenticated?}

    D -- No --> E[Homepage / Landing Page]
    E --> F{Choose action}
    F -- Login --> G[Authentication Module]
    F -- Register --> H[Registration Process]
    F -- Forgot Password --> I[Password Recovery]
    F -- Logout --> Z([End])

    G --> J{Credentials valid?}
    J -- Yes --> K[Create Session Token]
    K --> L{User Role}
    J -- No --> M[Show Login Error]
    M --> E

    H --> N[Create New User Account]
    N --> O[(Database: Users)]
    O --> P{Assigned role}
    P -- Student --> Q[Student Dashboard]
    P -- Admin --> S[Admin Dashboard]

    I --> T[Send Reset Link / Update Password]
    T --> E

    L -- Admin --> S
    L -- Student --> Q

    subgraph UserRoles[Role-Based Access Control]
        S
        Q
    end

    subgraph AdminModule[Admin Module]
        S --> S1[Admin Dashboard]
        S1 --> S2[User Management CRUD]
        S1 --> S3[Logs and Activity Monitoring]
        S1 --> S4[Subscription Management]
        S1 --> S5[System Settings]
        S2 --> O
        S3 --> O
        S4 --> PYM[(Payment Gateway)]
        S5 --> O
    end

    subgraph StudentModule[Student Module]
        Q --> Q1[Student Dashboard]
        Q1 --> Q2[Subject Management CRUD]
        Q1 --> Q3[Task Management CRUD]
        Q1 --> Q4[Pomodoro Timer]
        Q1 --> Q5[Productivity Tracking]
        Q1 --> Q6[AI Coach]
        Q1 --> Q7[AI Study Pack Generator]
        Q1 --> Q8[PDF Upload and AI Processing]
        Q1 --> Q9[View Generated Study Packs]
        Q1 --> Q10[Analytics and Progress Reports]
        Q1 --> Q11[Subscription Management]

        Q2 --> O
        Q3 --> O
        Q4 --> Q12{Pomodoro Mode}
        Q12 -- Focus --> Q13[Track Focus Session]
        Q12 -- Short Break --> Q14[Track Short Break]
        Q12 -- Long Break --> Q15[Track Long Break]
        Q13 --> Q5
        Q14 --> Q5
        Q15 --> Q5
        Q5 --> O
        Q6 --> AI
        Q7 --> AI
        Q8 --> AI
        Q9 --> O
        Q10 --> O
        Q11 --> Q16{Current Plan}
        Q16 -- Free --> Q17[Continue Free Plan]
        Q16 -- Pro --> Q18[Upgrade to Pro]
        Q17 --> O
        Q18 --> Q19[Select Plan]
        Q19 --> Q20[Payment]
        Q20 --> Q21{Payment Verified?}
        Q21 -- Yes --> Q22[Activate Pro Plan]
        Q21 -- No --> Q23[Show Payment Error / Retry]
        Q22 --> O
        Q23 --> Q19
    end

    subgraph SharedServices[Shared Application Services]
        API[Frontend ↔ Backend API Communication]
        DB[(Database: Users, Subjects, Tasks, Sessions, Materials, Quizzes)]
        AI
        PYM[(Payment Gateway)]
        NOTIF[Notifications and Alarm System]
        ERR[Error Handling]
    end

    S2 --> API
    S3 --> API
    S4 --> API
    S5 --> API
    Q2 --> API
    Q3 --> API
    Q4 --> API
    Q5 --> API
    Q6 --> API
    Q7 --> API
    Q8 --> API
    Q9 --> API
    Q10 --> API
    Q11 --> API
    Q19 --> API
    Q20 --> API
    Q21 --> API

    API --> DB
    API --> AI
    API --> PYM
    API --> NOTIF
    API --> ERR
    NOTIF --> U[User Device / Alarm Notification]
    ERR --> E2[Display Friendly Error Message]
    E2 --> E3{Retry or Continue?}
    E3 -- Retry --> API
    E3 -- Continue --> Q

    subgraph AIFlow[AI Processing Workflow]
        AI --> AI1[Extract Text / PDF Content]
        AI1 --> AI2[Generate Summary]
        AI2 --> AI3[Generate Flashcards]
        AI3 --> AI4[Generate Quiz Questions]
        AI4 --> AI5[Store AI Study Pack in Database]
        AI5 --> AI6[Return Results to Frontend]
    end

    subgraph DataOps[Database Operations]
        DB --> D1[Create]
        DB --> D2[Read]
        DB --> D3[Update]
        DB --> D4[Delete]
    end

    Q --> LOGOUT[Logout]
    S --> LOGOUT
    LOGOUT --> Z([End])
```

## Flow Overview

- The system starts at the application launch and routes the user to the homepage.
- Authentication handles login, registration, password recovery, and logout.
- Role-based access directs users to the Admin or Student workflow.
- Admins manage users, logs, subscriptions, and system settings.
- Students use the Pomodoro timer, productivity tracking, AI coaching, study packs, and subscription features.
- All modules communicate through the backend API, database, AI engine, payment gateway, and notification services.
- Errors are handled centrally and users are guided back to retry or continue safely.

