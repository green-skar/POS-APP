import { apiFetch } from '@/utils/apiClient';
import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Input,
  Select,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  useToast,
  Badge,
  HStack,
  VStack,
  Text,
  IconButton
} from '@chakra-ui/react';
import { AddIcon, EditIcon, DeleteIcon } from '@chakra-ui/icons';

interface Product {
  id: number;
  name: string;
  barcode: string;
  price: number;
  stock_quantity: number;
  min_stock_level: number;
  category: string;
  description: string;
}

export default function Admin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    price: 0,
    stock_quantity: 0,
    min_stock_level: 5,
    category: '',
    description: ''
  });

  const categories = ['Beverages', 'Food', 'Dairy', 'Snacks', 'Personal Care', 'Cooking', 'Fruits'];

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await apiFetch('/api/products');
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch products',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';
      
      const response = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: editingProduct ? 'Product updated successfully' : 'Product created successfully',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        fetchProducts();
        resetForm();
        onClose();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save product');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save product',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      barcode: product.barcode || '',
      price: product.price,
      stock_quantity: product.stock_quantity,
      min_stock_level: product.min_stock_level,
      category: product.category || '',
      description: product.description || ''
    });
    onOpen();
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        const response = await apiFetch(`/api/products/${id}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          toast({
            title: 'Success',
            description: 'Product deleted successfully',
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
          fetchProducts();
        } else {
          throw new Error('Failed to delete product');
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to delete product',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      barcode: '',
      price: 0,
      stock_quantity: 0,
      min_stock_level: 5,
      category: '',
      description: ''
    });
    setEditingProduct(null);
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.barcode?.includes(searchTerm);
    const matchesCategory = !categoryFilter || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return <Box p={8}>Loading...</Box>;
  }

  return (
    <Box p={8}>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between">
          <Text fontSize="2xl" fontWeight="bold">Product Management</Text>
          <Button
            leftIcon={<AddIcon />}
            colorScheme="blue"
            onClick={() => {
              resetForm();
              onOpen();
            }}
          >
            Add Product
          </Button>
        </HStack>

        <HStack spacing={4}>
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            maxW="300px"
          />
          <Select
            placeholder="All Categories"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            maxW="200px"
          >
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </Select>
        </HStack>

        <Box overflowX="auto">
          <Table variant="simple">
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Barcode</Th>
                <Th>Price</Th>
                <Th>Stock</Th>
                <Th>Category</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredProducts.map((product) => (
                <Tr key={product.id}>
                  <Td>
                    <VStack align="start" spacing={1}>
                      <Text fontWeight="medium">{product.name}</Text>
                      <Text fontSize="sm" color="gray.500">{product.description}</Text>
                    </VStack>
                  </Td>
                  <Td fontFamily="mono">{product.barcode}</Td>
                  <Td>KSh {product.price.toFixed(2)}</Td>
                  <Td>
                    <HStack>
                      <Text>{product.stock_quantity}</Text>
                      {product.stock_quantity <= product.min_stock_level && (
                        <Badge colorScheme="red" size="sm">Low Stock</Badge>
                      )}
                    </HStack>
                  </Td>
                  <Td>
                    <Badge colorScheme="blue" variant="subtle">
                      {product.category}
                    </Badge>
                  </Td>
                  <Td>
                    <HStack>
                      <IconButton
                        aria-label="Edit product"
                        icon={<EditIcon />}
                        size="sm"
                        onClick={() => handleEdit(product)}
                      />
                      <IconButton
                        aria-label="Delete product"
                        icon={<DeleteIcon />}
                        size="sm"
                        colorScheme="red"
                        variant="ghost"
                        onClick={() => handleDelete(product.id)}
                      />
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      </VStack>

      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {editingProduct ? 'Edit Product' : 'Add New Product'}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <form onSubmit={handleSubmit}>
              <VStack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Product Name</FormLabel>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter product name"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Barcode</FormLabel>
                  <Input
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="Enter barcode"
                  />
                </FormControl>

                <HStack spacing={4} w="full">
                  <FormControl isRequired>
                    <FormLabel>Price (KSh)</FormLabel>
                    <NumberInput
                      value={formData.price}
                      onChange={(value) => setFormData({ ...formData, price: parseFloat(value) || 0 })}
                      min={0}
                      step={0.01}
                    >
                      <NumberInputField />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Stock Quantity</FormLabel>
                    <NumberInput
                      value={formData.stock_quantity}
                      onChange={(value) => setFormData({ ...formData, stock_quantity: parseInt(value) || 0 })}
                      min={0}
                    >
                      <NumberInputField />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                  </FormControl>
                </HStack>

                <HStack spacing={4} w="full">
                  <FormControl>
                    <FormLabel>Min Stock Level</FormLabel>
                    <NumberInput
                      value={formData.min_stock_level}
                      onChange={(value) => setFormData({ ...formData, min_stock_level: parseInt(value) || 5 })}
                      min={0}
                    >
                      <NumberInputField />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Category</FormLabel>
                    <Select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Select category"
                    >
                      {categories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </Select>
                  </FormControl>
                </HStack>

                <FormControl>
                  <FormLabel>Description</FormLabel>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter product description"
                  />
                </FormControl>

                <HStack spacing={4} w="full" justify="flex-end">
                  <Button onClick={onClose}>Cancel</Button>
                  <Button type="submit" colorScheme="blue">
                    {editingProduct ? 'Update' : 'Create'} Product
                  </Button>
                </HStack>
              </VStack>
            </form>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

