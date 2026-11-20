import torch
import torch.nn as nn
import numpy as np


# 9 Input Features:
# [0] in_danger_zone (0/1)
# [1] items_stolen_norm (0..1)
# [2] stealth (0..1)
# [3] choice_norm (0.0=Bluff, 0.5=Charm, 1.0=Intimidate)
# [4] trust (0..1)
# [5] curiosity (0..1)
# [6] aggression (0..1)
# [7] items_noticed_missing (0/1)
# [8] player_missing_from_floor1 (0/1)

def generate_dataset(n=12000):
    X = np.zeros((n, 9), dtype=np.float32)
    Y = np.zeros((n, 3), dtype=np.float32)

    for i in range(n):
        danger   = np.random.choice([0.0, 1.0], p=[0.2, 0.8])
        stolen   = np.random.choice([0.0, 0.33, 0.67, 1.0])
        stealth  = np.random.uniform(0.5, 1.0)
        choice   = np.random.choice([0.0, 0.5, 1.0]) # Bluff, Charm, Intimidate
        trust    = np.random.uniform(0.0, 1.0)
        cur      = np.random.uniform(0.0, 1.0)
        agg      = np.random.uniform(0.0, 1.0)
        missing  = np.random.choice([0.0, 1.0], p=[0.55, 0.45])
        f1_miss  = np.random.choice([0.0, 1.0], p=[0.6, 0.4])

        # Ground-truth psychological dynamics
        if choice == 0.0: # Bluff
            dT = -0.08 - 0.12 * missing - 0.06 * f1_miss + 0.05 * stealth
            dC =  0.16 + 0.14 * missing + 0.10 * f1_miss + 0.08 * stolen
            dA =  0.04 + 0.10 * missing + 0.05 * danger
        elif choice == 0.5: # Charm
            dT =  0.15 - 0.14 * missing - 0.05 * stolen
            dC = -0.06 + 0.12 * missing + 0.08 * f1_miss
            dA = -0.08 + 0.10 * missing
        else: # Intimidate
            dT = -0.28 - 0.10 * missing
            dC =  0.08 + 0.10 * missing
            dA =  0.28 + 0.16 * missing + 0.10 * danger + 0.08 * cur

        # Add slight organic variance
        dT += np.random.normal(0, 0.015)
        dC += np.random.normal(0, 0.015)
        dA += np.random.normal(0, 0.015)

        X[i] = [danger, stolen, stealth, choice, trust, cur, agg, missing, f1_miss]
        Y[i] = np.clip([dT, dC, dA], -0.45, 0.45)

    return torch.tensor(X), torch.tensor(Y)

class NPCBrain(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(9, 48),
            nn.ReLU(),
            nn.Linear(48, 32),
            nn.ReLU(),
            nn.Linear(32, 3),
            nn.Tanh()
        )
    def forward(self, x):
        return self.net(x) * 0.45

torch.manual_seed(42)
X_train, Y_train = generate_dataset(12000)
model = NPCBrain()
opt = torch.optim.Adam(model.parameters(), lr=0.003)
loss_fn = nn.MSELoss()

for epoch in range(220):
    opt.zero_grad()
    loss = loss_fn(model(X_train), Y_train)
    loss.backward()
    opt.step()

final_loss = loss_fn(model(X_train), Y_train)
print(f"Final Training MSE Loss: {final_loss.item():.6f}")

model.eval()
dummy = torch.zeros(1, 9, dtype=torch.float32)
torch.onnx.export(
    model, (dummy,), "npc_brain.onnx",
    input_names=["player_state"],
    output_names=["mood_deltas"],
    opset_version=14
)
print("Exported 9-feature npc_brain.onnx successfully!")
