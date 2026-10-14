"""24 geometric descriptors -> hidden ReLU/Tanh layers -> four logits."""
from torch import nn


class MeshMLP(nn.Module):
    def __init__(self, input_dim=24, hidden_units=48, hidden_layers=2, activation="relu", classes=4):
        super().__init__()
        nonlinear = nn.ReLU if activation == "relu" else nn.Tanh
        layers = []
        previous = input_dim
        for _ in range(hidden_layers):
            layers.extend([nn.Linear(previous, hidden_units), nonlinear()])
            previous = hidden_units
        layers.append(nn.Linear(previous, classes))
        self.layers = nn.Sequential(*layers)

    def forward(self, x):
        # Return logits: CrossEntropyLoss applies log-softmax internally.
        return self.layers(x)
