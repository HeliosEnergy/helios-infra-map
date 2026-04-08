export interface TransmissionLine {
  id: string;
  coordinates: [number, number][];
  properties: {
    objectId?: number;
    objectId1?: number;
    id?: string;
    type?: string;
    status?: string;
    naicsCode?: string;
    naicsDesc?: string;
    source?: string;
    sourceDate?: number;
    valMethod?: string;
    valDate?: number;
    owner?: string;
    voltage?: number;
    voltClass?: string;
    inferred?: string;
    sub1?: string;
    sub2?: string;
    shapeLength?: number;
    globalId?: string;
    [key: string]: any; // For any additional properties
  };
}

