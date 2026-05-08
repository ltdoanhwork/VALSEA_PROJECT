from datasets import load_dataset


def load_dataset():
    ds = load_dataset("mteb/stsbenchmark-sts")

    train_dataset = load_dataset("username/my_dataset", split="train")
    valid_dataset = load_dataset("username/my_dataset", split="validation")
    test_dataset  = load_dataset("username/my_dataset", split="test")

    return train_dataset, valid_dataset, test_dataset