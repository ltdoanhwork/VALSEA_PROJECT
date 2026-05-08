

class Trainer:
    def __init__(self, model_name: str, train_dataset: Dataset, valid_dataset: Dataset, test_dataset: Dataset):
        self.model_name = model_name
        self.train_dataset = train_dataset
        self.valid_dataset = valid_dataset
        self.test_dataset = test_dataset

    def train(self):
        pass